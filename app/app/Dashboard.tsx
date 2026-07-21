'use client'

import { useEffect, useRef, useState } from 'react'
import styles from './dashboard.module.css'
import DashboardHeader from './DashboardHeader'
import WelcomeBackdrop from '@/components/WelcomeBackdrop'
import DashboardGrid from './DashboardGrid'
import AppSidebar from './AppSidebar'
import OverviewWidgets from './OverviewWidgets'
import '@/components/veeTiles.css'
import { dashboardChrome, backgroundAccent, DEFAULT_CHROME, type DashboardChrome } from '@/lib/tiles/dashboardChrome'

interface DashboardProps {
  firstName: string | null
  userId: string
}

const AMBIENT_MUTED_KEY = 'vitality:ambientMuted'

function SpeakerIcon({ muted }: { muted: boolean }) {
  const common = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  if (muted) {
    return (
      <svg {...common}>
        <path d="M4 9v6h4l5 4V5L8 9H4Z" />
        <path d="M16 9l5 6M21 9l-5 6" />
      </svg>
    )
  }
  return (
    <svg {...common}>
      <path d="M4 9v6h4l5 4V5L8 9H4Z" />
      <path d="M16.5 8.5a5 5 0 0 1 0 7" />
      <path d="M19 6a8.5 8.5 0 0 1 0 12" />
    </svg>
  )
}

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
  const audioRef = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    setChrome(dashboardChrome.get(userId))
  }, [userId])

  useEffect(() => {
    setMuted(window.localStorage.getItem(AMBIENT_MUTED_KEY) === '1')
  }, [])

  useEffect(() => {
    if (audioRef.current) audioRef.current.muted = muted
  }, [muted])

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

  const wallAccent = chrome ? backgroundAccent(chrome.background) : '#6EE7B7'

  return (
    <main className={`${styles.page} ${styles.oneScreen} grain-overlay`} style={{ ['--wall-accent' as string]: wallAccent }}>
      <audio ref={audioRef} src="/ambient.mp3" loop preload="auto" />

      <WelcomeBackdrop background={chrome?.background} />

      <AppSidebar activeId={openTileId} onSelect={setOpenTileId} />

      <div className={styles.shell}>
        <div className={styles.headerRow}>
          <DashboardHeader firstName={firstName} greeting={chrome?.greeting} date={chrome?.date} />
        </div>

        {introPhase === 'done' && openTileId === null && (
          <>
            {/* Radar-ping boot: three rings expand from near the first card,
                the visual cue that "wakes up" the overview grid — see the
                .card entrance in OverviewWidgets.module.css for the other
                half (each card lights up as the ring reaches it). Gated on
                the intro screen so it plays once, right as the blur clears,
                not immediately on page load underneath it. Purely
                decorative, so it's inert to pointer/assistive tech. */}
            <span className={styles.pingRing} aria-hidden="true" />
            <span className={styles.pingRing} aria-hidden="true" />
            <span className={styles.pingRing} aria-hidden="true" />
            <OverviewWidgets userId={userId} />
          </>
        )}

        <DashboardGrid
          userId={userId}
          chrome={chrome ?? DEFAULT_CHROME}
          openId={openTileId}
          onOpenIdChange={setOpenTileId}
          hidePosterGrid
        />
      </div>

      {introPhase === 'done' && (
        <button
          type="button"
          className={styles.musicToggle}
          data-muted={muted}
          onClick={toggleMuted}
          title={muted ? 'Unmute ambient music' : 'Mute ambient music'}
          aria-label={muted ? 'Unmute ambient music' : 'Mute ambient music'}
        >
          <SpeakerIcon muted={muted} />
        </button>
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
            <span className={styles.introMark}>GIZMO</span>
            <span className={styles.introHint}>Click to enter</span>
          </div>
        </div>
      )}
    </main>
  )
}
