'use client'

import { useState, useEffect } from 'react'
import styles from './dashboard.module.css'
import { DEFAULT_CHROME, type Greeting, type DateConfig } from '@/lib/tiles/dashboardChrome'

interface DashboardHeaderProps {
  firstName?: string | null
  greeting?: Greeting
  date?: DateConfig
}

/**
 * The editorial greeting + date. Prop-driven so a user can personalise it
 * (lib/tiles/dashboardChrome): keep the auto time-of-day line or write their own,
 * show / accent their name, scale it, and pick the date format (or hide it). The
 * FONT stays Instrument Serif italic (the unified Vitality voice) — only wording,
 * name, accent, and scale are exposed.
 */
export default function DashboardHeader({ firstName, greeting, date }: DashboardHeaderProps) {
  const g = greeting ?? DEFAULT_CHROME.greeting
  const d = date ?? DEFAULT_CHROME.date
  const [autoWord, setAutoWord] = useState('')
  const [isBedtime, setIsBedtime] = useState(false)
  const [fullDate, setFullDate] = useState('')
  const [todayDate, setTodayDate] = useState('')
  const [clock, setClock] = useState('')
  const [typedCount, setTypedCount] = useState(0)

  useEffect(() => {
    const now = new Date()
    const hour = now.getHours()
    const bedtime = hour >= 0 && hour < 4
    setIsBedtime(bedtime)
    setAutoWord(bedtime ? 'Better get to bed' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening')
    setFullDate(now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }))
    setTodayDate(now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }))
  }, [])

  // Live clock, ticking every second (formatted without seconds).
  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  // Custom wording falls back to the auto line if blank (never render empty).
  const word = g.mode === 'custom' && g.text.trim() ? g.text.trim() : autoWord
  const includesName = !!(firstName && word.toLowerCase().includes(firstName.toLowerCase()))
  const renderName = g.showName && firstName && !includesName
  // The bedtime line ("Better get to bed, Charlie...") only applies to the
  // auto-computed word — a custom greeting the user typed themselves is left
  // exactly as they wrote it, no trailing ellipsis appended.
  const showEllipsis = isBedtime && !(g.mode === 'custom' && g.text.trim())
  const dateText = d.format === 'today' ? todayDate : fullDate

  const segments: { text: string; accent?: boolean }[] = [{ text: word }]
  if (renderName) {
    segments.push({ text: ', ' }, { text: firstName as string, accent: !!g.accentName })
  }
  if (showEllipsis) segments.push({ text: '...' })
  const fullLength = segments.reduce((n, s) => n + s.text.length, 0)

  // Types the greeting out a character at a time, like a terminal log line.
  // Skips straight to the full text under prefers-reduced-motion.
  useEffect(() => {
    if (!word) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) {
      setTypedCount(fullLength)
      return
    }
    setTypedCount(0)
    const id = setInterval(() => {
      setTypedCount((c) => {
        if (c + 1 >= fullLength) {
          clearInterval(id)
          return fullLength
        }
        return c + 1
      })
    }, 45)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word, renderName, showEllipsis, firstName, g.accentName])

  let consumed = 0

  return (
    <div className={styles.header} style={{ ['--greet-scale' as string]: g.scale }}>
      <h1 className={styles.greeting}>
        {segments.map((seg, i) => {
          const start = consumed
          consumed += seg.text.length
          const visible = Math.max(0, Math.min(seg.text.length, typedCount - start))
          return (
            <span key={i} className={seg.accent ? styles.greetingName : undefined}>
              {seg.text.slice(0, visible)}
            </span>
          )
        })}
        {/* Stays visible (and blinking) after the message finishes typing too —
            a terminal cursor, not just a typing indicator. */}
        <span className={styles.caret} aria-hidden="true">
          ▌
        </span>
      </h1>
      <div className={styles.heroStats}>
        {d.show && <span className={styles.heroDate}>{dateText}</span>}
        {d.show && clock && <span className={styles.heroDot} aria-hidden>·</span>}
        {clock && <span className={styles.heroStat}>{clock}</span>}
      </div>
    </div>
  )
}
