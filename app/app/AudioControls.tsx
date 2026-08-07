'use client'

import styles from './AudioControls.module.css'

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
 * Mute button + volume slider for the ambient track. One shared component so
 * the Home screen (floating fixed, top-right) and every open tile's own top
 * bar (inline, `compact`) stay in sync off the same state instead of each
 * growing its own half of this control — see Dashboard.tsx for where the
 * actual <audio> element and its muted/volume state live.
 */
export default function AudioControls({
  muted,
  volume,
  onToggleMute,
  onVolumeChange,
  compact,
  className,
}: {
  muted: boolean
  volume: number
  onToggleMute: () => void
  onVolumeChange: (v: number) => void
  /** Sized down to fit a tile's own slim top bar instead of floating fixed. */
  compact?: boolean
  className?: string
}) {
  return (
    <div className={`${styles.controls}${compact ? ` ${styles.compact}` : ''}${className ? ` ${className}` : ''}`}>
      <button
        type="button"
        className={styles.muteBtn}
        data-muted={muted}
        onClick={onToggleMute}
        title={muted ? 'Unmute ambient music' : 'Mute ambient music'}
        aria-label={muted ? 'Unmute ambient music' : 'Mute ambient music'}
      >
        <SpeakerIcon muted={muted} />
      </button>
      <input
        type="range"
        className={styles.volumeSlider}
        min={0}
        max={1}
        step={0.01}
        value={muted ? 0 : volume}
        onChange={(e) => onVolumeChange(Number(e.target.value))}
        aria-label="Ambient music volume"
      />
    </div>
  )
}
