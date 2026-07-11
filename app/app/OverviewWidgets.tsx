'use client'

import { useEffect, useState } from 'react'
import styles from './OverviewWidgets.module.css'
import { tileStore } from '@/lib/tiles/tileStore'

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}
function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : []
}

function fuelTodayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function workoutDayKey(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

/* ---- Peak's own circadian + caffeine math, copied verbatim from
   public/tiles/peak.html so the overview's "energy now" gauge matches the
   real tile exactly. Keep these two in sync if the source ever changes. ---- */
function clamp(x: number, a: number, b: number) {
  return Math.max(a, Math.min(b, x))
}
const KA = 4.0, HALF_LIFE = 5, KE = Math.LN2 / HALF_LIFE
function doseAmount(mg: number, h: number) {
  if (h < 0) return 0
  if (Math.abs(KA - KE) < 1e-9) return 0
  return Math.max(0, (mg * KA) / (KA - KE) * (Math.exp(-KE * h) - Math.exp(-KA * h)))
}
function parseHM(s?: string) {
  if (!s) return null
  const m = String(s).match(/(\d{1,2}):(\d{2})/)
  if (!m) return null
  return Number(m[1]) + Number(m[2]) / 60
}
function shape(t: number, wake: number, bed: number) {
  const L = (((bed - wake) % 24) + 24) % 24 || 16
  const aw = (((t - wake) % 24) + 24) % 24
  if (aw > L) {
    const into = aw - L, sleepLen = 24 - L || 8, mid = sleepLen / 2
    return 0.12 - 0.07 * (1 - Math.abs(into - mid) / mid)
  }
  const inertia = 0.55 + 0.45 * (1 - Math.exp(-aw / 1.0))
  const decline = 1 - 0.16 * (aw / L)
  const winddown = 1 - 0.4 * clamp((aw - (L - 1.5)) / 1.5, 0, 1)
  const dip = 0.13 * Math.exp(-Math.pow(aw - L * 0.45, 2) / (2 * 1.7 * 1.7))
  const eve = 0.07 * Math.exp(-Math.pow(aw - (L - 4), 2) / (2 * 2.0 * 2.0))
  return Math.max(0.04, 0.92 * inertia * decline * winddown - dip + eve)
}
function energyNow(store: Record<string, unknown>): { value: number; status: string } {
  const wake = parseHM(store.wake as string | undefined) ?? 7
  const bed = parseHM(store.bed as string | undefined) ?? 23
  const now = new Date()
  const t = now.getHours() + now.getMinutes() / 60
  const dayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const log = asRecord(store.log)
  const today = asRecord(log[dayKey])
  const slept = typeof today.slept === 'number' ? today.slept : null
  const recScale = 0.58 + 0.42 * (slept == null ? 0.78 : clamp(slept / 8, 0.3, 1))
  const base = clamp(shape(t, wake, bed) * 100 * recScale, 1, 100)
  const caff = asArray<{ mg?: number; t?: number }>(today.caff)
  const bodyAt = (hh: number) => caff.reduce((s, l) => s + doseAmount(Number(l.mg) || 0, hh - (Number(l.t) || 0)), 0)
  const cur = bodyAt(t)
  let mx = cur
  for (let dt = 0.5; dt <= 5; dt += 0.5) mx = Math.max(mx, bodyAt(t - dt))
  const boost = Math.min(22, cur * 0.14)
  const rebound = Math.min(13, Math.max(0, mx - cur) * 0.1)
  const value = Math.round(clamp(base + boost - rebound, 1, 100))
  const status = value >= 80 ? 'peak zone' : value >= 62 ? 'dialed in' : value >= 45 ? 'steady' : value >= 28 ? 'running low' : 'depleted'
  return { value, status }
}

interface Widgets {
  fuel: { kcal: number; kcalGoal: number; protein: number; proteinGoal: number } | null
  finance: { netWorth: number; history: { t: number; v: number }[] } | null
  peak: { value: number; status: string } | null
  workout: { streak: number; sessionsThisWeek: number } | null
  goals: { shortDone: number; shortTotal: number; longDone: number; longTotal: number } | null
  calendar: { dueToday: number; overdue: number; connected: boolean } | null
}

function RadialGauge({ pct, label, sub }: { pct: number; label: string; sub: string }) {
  const r = 46
  const c = 2 * Math.PI * r
  const clamped = clamp(pct, 0, 100)
  return (
    <div className={styles.gaugeWrap}>
      <svg viewBox="0 0 120 120" className={styles.gaugeSvg}>
        <circle cx="60" cy="60" r={r} className={styles.gaugeTrack} />
        <circle
          cx="60"
          cy="60"
          r={r}
          className={styles.gaugeFill}
          strokeDasharray={`${c}`}
          strokeDashoffset={`${c * (1 - clamped / 100)}`}
          transform="rotate(-90 60 60)"
        />
      </svg>
      <div className={styles.gaugeCenter}>
        <span className={styles.gaugeNum}>{Math.round(clamped)}</span>
        <span className={styles.gaugeSub}>{sub}</span>
      </div>
      <span className={styles.gaugeLabel}>{label}</span>
    </div>
  )
}

function Sparkline({ points }: { points: { t: number; v: number }[] }) {
  if (points.length < 2) return <p className={styles.emptyNote}>Add an account in Finance to see this grow.</p>
  const W = 100, H = 36
  const vals = points.map((p) => p.v)
  const min = Math.min(...vals), max = Math.max(...vals)
  const span = max - min || 1
  const xs = points.map((_, i) => (i / (points.length - 1)) * W)
  const ys = points.map((p) => H - ((p.v - min) / span) * H)
  const d = xs.map((x, i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${ys[i].toFixed(1)}`).join(' ')
  const area = `${d} L ${W} ${H} L 0 ${H} Z`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={styles.sparkline} preserveAspectRatio="none">
      <path d={area} className={styles.sparkArea} />
      <path d={d} className={styles.sparkLine} />
    </svg>
  )
}

function Bar({ label, pct, value }: { label: string; pct: number; value: string }) {
  return (
    <div className={styles.barRow}>
      <div className={styles.barHead}>
        <span>{label}</span>
        <span className={styles.barValue}>{value}</span>
      </div>
      <div className={styles.barTrack}>
        <div className={styles.barFill} style={{ width: `${clamp(pct, 0, 100)}%` }} />
      </div>
    </div>
  )
}

export default function OverviewWidgets({ userId }: { userId: string }) {
  const [w, setW] = useState<Widgets | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const [fuelRaw, workoutRaw, goalsRaw, peakRaw, financeRaw] = await Promise.all([
        tileStore.loadData(userId, 'fuel'),
        tileStore.loadData(userId, 'workout'),
        tileStore.loadData(userId, 'goals'),
        tileStore.loadData(userId, 'peak'),
        tileStore.loadData(userId, 'finance'),
      ])

      const fuelStore = asRecord(fuelRaw)
      const todaysLog = asArray<{ cal?: number; p?: number }>(fuelStore[fuelTodayKey()])
      const fuel = {
        kcal: Math.round(todaysLog.reduce((s, e) => s + (Number(e.cal) || 0), 0)),
        kcalGoal: typeof fuelStore.goalCal === 'number' ? fuelStore.goalCal : 2000,
        protein: Math.round(todaysLog.reduce((s, e) => s + (Number(e.p) || 0), 0)),
        proteinGoal: typeof fuelStore.goalProtein === 'number' ? fuelStore.goalProtein : 150,
      }

      const workoutStore = asRecord(workoutRaw)
      const entries = asArray<{ ts: number }>(workoutStore.entries)
      const days = new Set(entries.map((e) => workoutDayKey(e.ts)))
      let streak = 0
      if (days.size) {
        const d = new Date()
        d.setHours(0, 0, 0, 0)
        if (!days.has(workoutDayKey(d.getTime()))) d.setDate(d.getDate() - 1)
        while (days.has(workoutDayKey(d.getTime()))) {
          streak++
          d.setDate(d.getDate() - 1)
        }
      }
      const weekCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
      const sessionsThisWeek = new Set(entries.filter((e) => e.ts >= weekCutoff).map((e) => workoutDayKey(e.ts))).size
      const workout = { streak, sessionsThisWeek }

      const goalsStore = asRecord(goalsRaw)
      const shortTerm = asArray<{ done?: boolean }>(goalsStore.shortTerm)
      const longTerm = asArray<{ done?: boolean }>(goalsStore.longTerm)
      const goals = {
        shortDone: shortTerm.filter((g) => g.done).length,
        shortTotal: shortTerm.length,
        longDone: longTerm.filter((g) => g.done).length,
        longTotal: longTerm.length,
      }

      const peakStore = asRecord(peakRaw)
      const peak = energyNow(peakStore)

      const financeStore = asRecord(financeRaw)
      const accounts = asArray<{ amountCHF?: number }>(financeStore.accounts)
      const netWorth = Math.round(accounts.reduce((s, a) => s + (Number(a.amountCHF) || 0), 0))
      const history = asArray<{ t: number; v: number }>(financeStore.netWorthHistory)
      const finance = { netWorth, history }

      let calendar: Widgets['calendar'] = { dueToday: 0, overdue: 0, connected: false }
      try {
        const res = await fetch('/api/todoist/tasks', { cache: 'no-store' })
        if (res.ok) {
          const body = await res.json()
          const tasks = Array.isArray(body) ? body : Array.isArray(body?.results) ? body.results : []
          const today = new Date()
          today.setHours(0, 0, 0, 0)
          let dueToday = 0, overdue = 0
          for (const t of tasks as Array<{ due?: { date?: string } | string }>) {
            const raw = typeof t.due === 'string' ? t.due : t.due?.date
            if (!raw) continue
            const d = new Date(raw)
            if (isNaN(d.getTime())) continue
            d.setHours(0, 0, 0, 0)
            if (d.getTime() === today.getTime()) dueToday++
            else if (d.getTime() < today.getTime()) overdue++
          }
          calendar = { dueToday, overdue, connected: true }
        }
      } catch {
        /* Todoist not configured — calendar widget shows a quiet "not connected" line */
      }

      if (alive) setW({ fuel, workout, goals, peak, finance, calendar })
    })()
    return () => {
      alive = false
    }
  }, [userId])

  if (!w) return null

  return (
    <div className={styles.grid}>
      <div className={styles.card}>
        <div className={styles.cardHead}>
          <span className={styles.cardTitle}>today&rsquo;s intake</span>
          <span className={styles.cardTag}>fuel</span>
        </div>
        {w.fuel ? (
          <div className={styles.bars}>
            <Bar label="calories" pct={(w.fuel.kcal / (w.fuel.kcalGoal || 1)) * 100} value={`${w.fuel.kcal.toLocaleString()} / ${w.fuel.kcalGoal.toLocaleString()} kcal`} />
            <Bar label="protein" pct={(w.fuel.protein / (w.fuel.proteinGoal || 1)) * 100} value={`${w.fuel.protein}g / ${w.fuel.proteinGoal}g`} />
          </div>
        ) : (
          <p className={styles.emptyNote}>Log a meal in Fuel to see today&rsquo;s numbers.</p>
        )}
      </div>

      <div className={styles.card}>
        <div className={styles.cardHead}>
          <span className={styles.cardTitle}>energy now</span>
          <span className={styles.cardTag}>peak</span>
        </div>
        {w.peak && <RadialGauge pct={w.peak.value} label={w.peak.status} sub="/ 100" />}
      </div>

      <div className={styles.card}>
        <div className={styles.cardHead}>
          <span className={styles.cardTitle}>net worth</span>
          <span className={styles.cardTag}>finance</span>
        </div>
        {w.finance && (
          <>
            <span className={styles.bigNum}>{w.finance.netWorth.toLocaleString()}</span>
            <Sparkline points={w.finance.history} />
          </>
        )}
      </div>

      <div className={styles.card}>
        <div className={styles.cardHead}>
          <span className={styles.cardTitle}>consistency</span>
          <span className={styles.cardTag}>workout</span>
        </div>
        {w.workout && <RadialGauge pct={(w.workout.sessionsThisWeek / 7) * 100} label={`${w.workout.streak}d streak`} sub="/ wk" />}
      </div>

      <div className={styles.card}>
        <div className={styles.cardHead}>
          <span className={styles.cardTitle}>goals progress</span>
          <span className={styles.cardTag}>goals</span>
        </div>
        {w.goals && (
          <div className={styles.bars}>
            <Bar
              label="short-term"
              pct={w.goals.shortTotal ? (w.goals.shortDone / w.goals.shortTotal) * 100 : 0}
              value={`${w.goals.shortDone} / ${w.goals.shortTotal}`}
            />
            <Bar
              label="long-term"
              pct={w.goals.longTotal ? (w.goals.longDone / w.goals.longTotal) * 100 : 0}
              value={`${w.goals.longDone} / ${w.goals.longTotal}`}
            />
          </div>
        )}
      </div>

      <div className={styles.card}>
        <div className={styles.cardHead}>
          <span className={styles.cardTitle}>this week</span>
          <span className={styles.cardTag}>calendar</span>
        </div>
        {w.calendar?.connected ? (
          <>
            <span className={styles.bigNum}>{w.calendar.dueToday}</span>
            <span className={styles.smallLabel}>due today{w.calendar.overdue ? ` · ${w.calendar.overdue} overdue` : ''}</span>
          </>
        ) : (
          <p className={styles.emptyNote}>Connect Todoist to see this here.</p>
        )}
      </div>
    </div>
  )
}
