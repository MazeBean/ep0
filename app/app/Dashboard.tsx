'use client'

import { useEffect, useRef, useState } from 'react'
import styles from './dashboard.module.css'
import DashboardHeader from './DashboardHeader'
import WelcomeBackdrop from '@/components/WelcomeBackdrop'
import DashboardGrid from './DashboardGrid'
import AppSidebar from './AppSidebar'
import OverviewWidgets from './OverviewWidgets'
import AudioControls from './AudioControls'
import '@/components/veeTiles.css'
import { dashboardChrome, backgroundAccent, DEFAULT_CHROME, type DashboardChrome } from '@/lib/tiles/dashboardChrome'

interface DashboardProps {
  firstName: string | null
  userId: string
}

const AMBIENT_MUTED_KEY = 'vitality:ambientMuted'
const AMBIENT_VOLUME_KEY = 'vitality:ambientVolume'
const DEFAULT_VOLUME = 0.7

/**
 * The whole base app: one dashboard. The Vitality character lives in the header
 * gem next to the greeting; below sits the animated-orb tile grid. Every tile is
 * an inert "slot" you fill with your own sealed HTML (see public/tiles/README.md).
 *
 * Zero backend: chrome (wallpaper + greeting) is localStorage, tiles are static
 * files under /public/tiles, and there's no auth. `userId` is a constant so the
 * localStorage namespaces (chrome, tile skins, layout) stay stable per browser.
 */
export default function Dashboard({ firstName, userId }: DashboardProps) {
  const [chrome, setChrome] = useState<DashboardChrome | undefined>(undefined)
  // Which tile is open, docked in the main pane — shared by the sidebar nav
  // and the grid so either entry point opens the exact same view.
  const [openTileId, setOpenTileId] = useState<string | null>(null)

  // The blurred entry screen. Not just decorative: a browser won't play audio
  // with sound until a real user gesture happens on the page, so this click is
  // also the ambient track's one and only chance to start — see enterDashboard.
  // 'shown' -> 'leaving' (CSS fade starts) -> 'done' (unmounted, panels + ping
  // animation mount fresh here, same as they always have on first mount).
  const [introPhase, setIntroPhase] = useState<'shown' | 'leaving' | 'done'>('shown')
  const [muted, setMuted] = useState(false)
  const [volume, setVolume] = useState(DEFAULT_VOLUME)
  const audioRef = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    setChrome(dashboardChrome.get(userId))
  }, [userId])

  useEffect(() => {
    setMuted(window.localStorage.getItem(AMBIENT_MUTED_KEY) === '1')
    const storedVolume = window.localStorage.getItem(AMBIENT_VOLUME_KEY)
    if (storedVolume != null) {
      const v = Number(storedVolume)
      if (Number.isFinite(v)) setVolume(Math.max(0, Math.min(1, v)))
    }
  }, [])

  useEffect(() => {
    if (audioRef.current) audioRef.current.muted = muted
  }, [muted])

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume
  }, [volume])

  // Without this, the ambient track keeps going (and keeps exposing an
  // OS-level lock-screen "Now Playing" card for it, same as a real music
  // app) once the phone locks or the tab/app is backgrounded — a plain
  // <audio> element has no idea it's supposed to be "part of the app being
  // open". Pausing on hidden and resuming on return (only past the intro
  // gesture, so this never tries to autoplay before one has happened) makes
  // sound track the app's own foreground/background state instead.
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        audioRef.current?.pause()
      } else if (introPhase === 'done') {
        audioRef.current?.play().catch(() => {})
      }
    }
    // iOS Safari doesn't reliably fire visibilitychange on every app-switch
    // away; pagehide covers the cases it misses, plus tab close/navigation.
    const handlePageHide = () => audioRef.current?.pause()
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('pagehide', handlePageHide)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('pagehide', handlePageHide)
    }
  }, [introPhase])

  const enterDashboard = () => {
    if (introPhase !== 'shown') return
    setIntroPhase('leaving')
    audioRef.current?.play().catch(() => {
      /* no ambient.mp3 yet, or the browser still refused — either way the
         dashboard itself isn't blocked on it */
    })
    setTimeout(() => setIntroPhase('done'), 550)
  }

  const toggleMuted = () => {
    setMuted((m) => {
      const next = !m
      window.localStorage.setItem(AMBIENT_MUTED_KEY, next ? '1' : '0')
      return next
    })
  }

  // Dragging the slider mirrors any other media player: moving it above 0
  // un-mutes (so the level you just set is actually heard), and dragging it
  // all the way down mutes — the mute button and this stay two independent
  // controls, but each still nudges the other into a sane matching state.
  const changeVolume = (v: number) => {
    const clamped = Math.max(0, Math.min(1, v))
    setVolume(clamped)
    window.localStorage.setItem(AMBIENT_VOLUME_KEY, String(clamped))
    if (clamped > 0 && muted) {
      setMuted(false)
      window.localStorage.setItem(AMBIENT_MUTED_KEY, '0')
    } else if (clamped === 0 && !muted) {
      setMuted(true)
      window.localStorage.setItem(AMBIENT_MUTED_KEY, '1')
    }
  }

  const wallAccent = chrome ? backgroundAccent(chrome.background) : '#6EE7B7'

  return (
    <main className={`${styles.page} ${styles.oneScreen} grain-overlay`} style={{ ['--wall-accent' as string]: wallAccent }}>
      {/* preload="metadata" not "auto" — the track is a long ambient mix
          (~100MB); no reason to eagerly pull the whole file before the
          intro's even been clicked, or on every reload while just testing. */}
      <audio ref={audioRef} src="/ambient.mp3" loop preload="metadata" />

      <WelcomeBackdrop background={chrome?.background} />

      <AppSidebar activeId={openTileId} onSelect={setOpenTileId} />

      <div className={styles.shell}>
        {introPhase === 'done' && (
          <div className={styles.headerRow}>
            <DashboardHeader firstName={firstName} greeting={chrome?.greeting} date={chrome?.date} />
          </div>
        )}

        {introPhase === 'done' && (
          <>
            {/* Radar-ping boot: three rings expand from near the first card,
                the visual cue that "wakes up" the overview grid — see the
                .card entrance in OverviewWidgets.module.css for the other
                half (each card lights up as the ring reaches it). Gated on
                the intro screen so it plays once, right as the blur clears,
                not immediately on page load underneath it. Purely
                decorative, so it's inert to pointer/assistive tech.
                No longer re-gated on openTileId===null: now that
                OverviewWidgets stays mounted (below) instead of remounting
                every Home revisit, its cards don't re-flash either — these
                would otherwise sweep on their own with nothing underneath
                reacting. The animation ends on its own (forwards fill-mode,
                huge + invisible) so leaving these mounted afterward is inert. */}
            <span className={styles.pingRing} aria-hidden="true" />
            <span className={styles.pingRing} aria-hidden="true" />
            <span className={styles.pingRing} aria-hidden="true" />
          </>
        )}

        {/* Stays mounted (just hidden) behind an open tile instead of
            unmounting — it used to live inside the same block as the ping
            rings above and fully remount every time you returned to Home,
            re-fetching all 5 tiles' data from scratch (including a Supabase
            round-trip each) right as the next tab click was likely coming,
            contending with and slowing down that tab's own load. */}
        {introPhase === 'done' && <OverviewWidgets userId={userId} hidden={openTileId !== null} />}

        <DashboardGrid
          userId={userId}
          chrome={chrome ?? DEFAULT_CHROME}
          openId={openTileId}
          onOpenIdChange={setOpenTileId}
          hidePosterGrid
          // Threaded down to each open tile's own top bar so the SAME mute
          // button + volume slider shows there too (see OpenTileOverlay) —
          // only handed down once the intro's cleared, matching the fixed
          // one below never appearing until then either.
          audioControls={introPhase === 'done' ? { muted, volume, onToggleMute: toggleMuted, onVolumeChange: changeVolume } : undefined}
        />
      </div>

      {/* Only rendered on Home — an open tile gets its own copy inline in
          its top bar (DashboardGrid's OpenTileOverlay) instead, since this
          fixed position would otherwise float on top of that tile's own
          header rather than sitting in it. */}
      {introPhase === 'done' && openTileId === null && (
        <AudioControls
          muted={muted}
          volume={volume}
          onToggleMute={toggleMuted}
          onVolumeChange={changeVolume}
          className={styles.musicToggle}
        />
      )}

      {introPhase !== 'done' && (
        <div
          className={`${styles.introOverlay}${introPhase === 'leaving' ? ` ${styles.introLeaving}` : ''}`}
          onClick={enterDashboard}
          role="button"
          tabIndex={0}
          aria-label="Enter dashboard"
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              enterDashboard()
            }
          }}
        >
          <div className={styles.introPrompt}>
            <span className={styles.introMark}>
              gizmo v1.1
              <span className={styles.introCaret} aria-hidden="true">▌</span>
            </span>
            <span className={styles.introHint}>Click to enter</span>
          </div>
        </div>
      )}
    </main>
  )
}
