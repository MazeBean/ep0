'use client'

import { useEffect, useState } from 'react'
import styles from './TopStatRow.module.css'
import { tileStore } from '@/lib/tiles/tileStore'

interface StatCard {
  value: string
  label: string
  sub?: string
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

/** Fuel's own todayKey() format — kept identical so this reads the same day's log. */
function fuelTodayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Workout's own dayKey() format (no zero-padding — different from Fuel's, kept
 *  identical to how workout.html itself keys days so the streak matches). */
function workoutDayKey(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

function workoutStreak(entries: Array<{ ts: number }>): number {
  const days = new Set(entries.map((e) => workoutDayKey(e.ts)))
  if (!days.size) return 0
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  if (!days.has(workoutDayKey(d.getTime()))) {
    d.setDate(d.getDate() - 1)
    if (!days.has(workoutDayKey(d.getTime()))) return 0
  }
  let count = 0
  while (days.has(workoutDayKey(d.getTime()))) {
    count++
    d.setDate(d.getDate() - 1)
  }
  return count
}

/**
 * The reference's top stat-card row, built from each tile's own saved data
 * (tileStore.loadData reads the same localStorage/Supabase row a tile's
 * window.Vitality.save() wrote — the host already has this access). Each
 * calculation mirrors that tile's own logic, so a change to a tile's shape
 * should be mirrored here too.
 */
export default function TopStatRow({ userId }: { userId: string }) {
  const [cards, setCards] = useState<StatCard[] | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const [fuel, workout, goals, finance] = await Promise.all([
        tileStore.loadData(userId, 'fuel'),
        tileStore.loadData(userId, 'workout'),
        tileStore.loadData(userId, 'goals'),
        tileStore.loadData(userId, 'finance'),
      ])
      if (!alive) return

      const fuelStore = asRecord(fuel)
      const todaysLog = Array.isArray(fuelStore[fuelTodayKey()]) ? (fuelStore[fuelTodayKey()] as Array<{ cal?: number }>) : []
      const kcalToday = Math.round(todaysLog.reduce((s, e) => s + (Number(e.cal) || 0), 0))
      const goalCal = typeof fuelStore.goalCal === 'number' ? fuelStore.goalCal : 2000

      const workoutStore = asRecord(workout)
      const entries = Array.isArray(workoutStore.entries) ? (workoutStore.entries as Array<{ ts: number }>) : []
      const streak = workoutStreak(entries)

      const goalsStore = asRecord(goals)
      const shortTerm = Array.isArray(goalsStore.shortTerm) ? (goalsStore.shortTerm as Array<{ done?: boolean }>) : []
      const longTerm = Array.isArray(goalsStore.longTerm) ? (goalsStore.longTerm as Array<{ done?: boolean }>) : []
      const openGoals = shortTerm.filter((g) => !g.done).length + longTerm.filter((g) => !g.done).length

      const financeStore = asRecord(finance)
      const accounts = Array.isArray(financeStore.accounts) ? (financeStore.accounts as Array<{ amountCHF?: number }>) : []
      const netWorth = Math.round(accounts.reduce((s, a) => s + (Number(a.amountCHF) || 0), 0))

      setCards([
        { value: kcalToday.toLocaleString('en-US'), label: 'kcal today', sub: `of ${goalCal.toLocaleString('en-US')} goal` },
        { value: String(streak), label: 'day streak', sub: 'workout' },
        { value: String(openGoals), label: 'goals open', sub: 'short + long' },
        { value: netWorth.toLocaleString('en-US'), label: 'net worth', sub: 'CHF' },
      ])
    })()
    return () => {
      alive = false
    }
  }, [userId])

  if (!cards) return null

  return (
    <div className={styles.row}>
      {cards.map((c) => (
        <div className={styles.card} key={c.label}>
          <span className={styles.value}>{c.value}</span>
          <span className={styles.label}>{c.label}</span>
          {c.sub && <span className={styles.sub}>{c.sub}</span>}
        </div>
      ))}
    </div>
  )
}
