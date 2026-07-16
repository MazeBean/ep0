'use client'

import { useEffect, useState } from 'react'
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

  useEffect(() => {
    setChrome(dashboardChrome.get(userId))
  }, [userId])

  const wallAccent = chrome ? backgroundAccent(chrome.background) : '#6EE7B7'

  return (
    <main className={`${styles.page} ${styles.oneScreen} grain-overlay`} style={{ ['--wall-accent' as string]: wallAccent }}>
      <WelcomeBackdrop background={chrome?.background} />

      <AppSidebar activeId={openTileId} onSelect={setOpenTileId} />

      <div className={styles.shell}>
        <div className={styles.headerRow}>
          <DashboardHeader firstName={firstName} greeting={chrome?.greeting} date={chrome?.date} />
        </div>

        {openTileId === null && (
          <>
            {/* Radar-ping boot: three rings expand from near the first card,
                the visual cue that "wakes up" the overview grid — see the
                .card entrance in OverviewWidgets.module.css for the other
                half (each card lights up as the ring reaches it). Purely
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
    </main>
  )
}
