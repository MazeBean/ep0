/**
 * tileBridge injects the Vitality bridge into every sealed tile at mount.
 *
 * A tile is a sandboxed srcDoc iframe: opaque origin, no network, and no
 * localStorage (it throws). The ONLY way a tile persists is by calling
 * window.Vitality.save/load, which this shim defines by postMessaging the host
 * (useTileHost) and matching each reply by id. Tiles stay pure feature code;
 * the bridge lives and upgrades here in one place.
 */

const SHIM = `<script>
(function () {
  var pending = {}, seq = 0;
  window.addEventListener('message', function (e) {
    var m = e.data;
    if (!m || m.source !== 'vitality-host') return;
    var p = pending[m.id];
    if (!p) return;
    delete pending[m.id];
    if (m.type === 'load:result') p.resolve(m.data);
    else if (m.type === 'save:ok') p.resolve(true);
    else if (m.type === 'save:error') p.reject(new Error(m.reason || 'save_failed'));
    else if (m.type === 'todoist:result') p.resolve(m.data);
    else if (m.type === 'todoist:error') p.reject(new Error(m.reason || 'todoist_failed'));
  });
  function call(type, extra) {
    return new Promise(function (resolve, reject) {
      var id = 'v' + (++seq);
      pending[id] = { resolve: resolve, reject: reject };
      var msg = { source: 'vitality-tile', type: type, id: id };
      if (extra) for (var k in extra) msg[k] = extra[k];
      parent.postMessage(msg, '*');
      // backstop: never let a tile hang if a reply is somehow lost.
      setTimeout(function () {
        if (!pending[id]) return;
        delete pending[id];
        if (type === 'load') resolve([]);
        else reject(new Error('vitality_timeout'));
      }, 8000);
    });
  }
  window.Vitality = {
    save: function (data) { return call('save', { data: data }); },
    load: function () { return call('load', {}); },
    report: function (stream) {
      parent.postMessage({ source: 'vitality-tile', type: 'report', stream: stream }, '*');
    },
    // Fired once, after a tile's first render with REAL data (not the initial
    // empty/loading paint) — lets the host wait to reveal the tile until its
    // true final size is known, instead of guessing a fixed delay.
    ready: function () {
      parent.postMessage({ source: 'vitality-tile', type: 'ready' }, '*');
    },
    // A sealed tile is sandboxed with no allow-downloads permission, so a
    // download triggered INSIDE the iframe is silently blocked in most
    // browsers. The host page isn't sandboxed, so it does the actual
    // Blob/anchor-click download on the tile's behalf.
    download: function (filename, content, mime) {
      parent.postMessage({ source: 'vitality-tile', type: 'download', filename: filename, content: content, mime: mime || 'text/plain' }, '*');
    },
    todoist: {
      list: function () { return call('todoist:list', {}); },
      add: function (content, due) { return call('todoist:add', { content: content, due: due }); },
      complete: function (id) { return call('todoist:complete', { id: id }); },
      remove: function (id) { return call('todoist:delete', { id: id }); }
    }
  };
  // Report this tile's real content height so the host can size the iframe
  // to fit it exactly and let the OUTER page scroll instead of the iframe's
  // own document. Sandboxed iframes have been unreliable for touch-scrolling
  // their own internal content on mobile Safari; a plain scrollable div in
  // the host (the same mechanism the Home screen already uses successfully)
  // sidesteps that entirely.
  //
  // IMPORTANT: every sealed tile sets html,body{height:100%} — so
  // document.documentElement's own height is self-referential to whatever
  // the HOST just set the iframe's box to. Watching it with a
  // ResizeObserver (as this once did) means applying a report triggers the
  // very "resize" that observer reacts to, feeding back on itself. Content
  // CHANGES (not the iframe's own box changing) are the real signal, so a
  // MutationObserver is used instead — it can't fire from the host resizing
  // the iframe, only from the tile's own DOM changing. It observes
  // documentElement, not body: this shim runs before <body> exists (it's
  // injected right after <head>), so document.body is still null here —
  // observing it would throw and silently abort everything below.
  var lastSent = 0;
  function reportHeight() {
    var h = document.documentElement.scrollHeight;
    if (h === lastSent) return;
    lastSent = h;
    parent.postMessage({ source: 'vitality-tile', type: 'resize', height: h }, '*');
  }
  if (window.MutationObserver) {
    new MutationObserver(reportHeight).observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true });
  } else {
    setInterval(reportHeight, 500);
  }
  window.addEventListener('load', reportHeight);
  // Late reflows (webfonts, images, first async render) land after 'load'.
  [50, 200, 500, 1000, 2000].forEach(function (ms) { setTimeout(reportHeight, ms); });
})();
</script>`

/** Prepend the bridge shim so window.Vitality exists inside the sealed tile. */
export function withBridge(html: string): string {
  if (html.includes('<head>')) return html.replace('<head>', '<head>' + SHIM)
  if (html.includes('<body>')) return html.replace('<body>', '<body>' + SHIM)
  return SHIM + html
}
