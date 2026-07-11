'use client'

import styles from './AppSidebar.module.css'
import { CORE_TILES, type CoreTileId } from '@/lib/tiles/coreTiles'

/** The 6 real, functional tiles get a permanent nav slot. Vee (locked
 *  centrepiece, no sealed content of its own) and Library (its own
 *  full-screen manager) stay off this list — this is a nav, not a mirror
 *  of every grid cell. */
const NAV_TILES: CoreTileId[] = ['fuel', 'workout', 'goals', 'todoist', 'peak', 'finance']

const HOME_GLYPH = (
  <svg viewBox="-12 -12 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M-9 -1 L0 -9 L9 -1" />
    <path d="M-6 -2 V9 H6 V-2" />
  </svg>
)

interface AppSidebarProps {
  activeId: string | null
  onSelect: (id: string | null) => void
}

export default function AppSidebar({ activeId, onSelect }: AppSidebarProps) {
  return (
    <aside className={styles.sidebar}>
      <div className={styles.brand}>
        <span className={styles.mark} aria-hidden="true">
          <svg viewBox="-12 -12 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M-8 -5 L0 9 L8 -5" />
          </svg>
        </span>
        <span className={styles.brandName}>GIZMO</span>
      </div>

      <nav className={styles.nav}>
        <button
          type="button"
          className={activeId === null ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem}
          onClick={() => onSelect(null)}
        >
          <span className={styles.navGlyph} aria-hidden="true">{HOME_GLYPH}</span>
          <span className={styles.navLabel}>home</span>
        </button>

        {NAV_TILES.map((id) => {
          const tile = CORE_TILES[id]
          const active = activeId === id
          return (
            <button
              key={id}
              type="button"
              className={active ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem}
              onClick={() => onSelect(id)}
            >
              <span className={styles.navGlyph} aria-hidden="true">{tile.glyph}</span>
              <span className={styles.navLabel}>{tile.label.toLowerCase()}</span>
            </button>
          )
        })}
      </nav>
    </aside>
  )
}
