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

function clamp(x: number, a: number, b: number) {
  return Math.max(a, Math.min(b, x))
}

interface StackItem {
  id: string
  name: string
}

interface Widgets {
  fuel: { kcal: number; kcalGoal: number; protein: number; proteinGoal: number } | null
  finance: { netWorth: number; history: { t: number; v: number }[] } | null
  workout: { prsThisMonth: number; sessionsThisWeek: number } | null
  goals: { shortDone: number; shortTotal: number; longDone: number; longTotal: number } | null
  calendar: { dueToday: number; overdue: number; connected: boolean } | null
  stack: { items: StackItem[]; checked: string[] } | null
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

/* ---- counterclockwise arc gauge geometry, ported verbatim from
   public/tiles/fuel.html's polarPt/arcPathCCW so this wheel matches Fuel's
   calorie gauge exactly rather than approximating it with stroke-dasharray. ---- */
function polarPt(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}
function arcPathCCW(cx: number, cy: number, r: number, pct: number) {
  const clamped = Math.max(0, Math.min(0.9999, pct))
  const sweepDeg = -360 * clamped
  const start = polarPt(cx, cy, r, 0)
  const end = polarPt(cx, cy, r, sweepDeg)
  const largeArc = Math.abs(sweepDeg) > 180 ? 1 : 0
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 ${largeArc} 0 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`
}
function WheelGauge({ pct, num, sub, label, over }: { pct: number; num: number; sub: string; label: string; over?: boolean }) {
  const cx = 50, cy = 50, r = 42
  const clamped = clamp(pct, 0, 100) / 100
  const d = clamped > 0 ? arcPathCCW(cx, cy, r, clamped) : ''
  return (
    <div className={styles.wheelWrap}>
      <svg viewBox="0 0 100 100" className={styles.wheelSvg}>
        <circle cx={cx} cy={cy} r={r} className={styles.wheelTrack} />
        {d && <path d={d} className={over ? `${styles.wheelFill} ${styles.wheelFillOver}` : styles.wheelFill} />}
      </svg>
      <div className={styles.wheelCenter}>
        <span className={styles.wheelNum}>{num}</span>
        <span className={styles.wheelSub}>{sub}</span>
      </div>
      <span className={styles.wheelLabel}>{label}</span>
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
  // Full raw Body store (not just the derived stack summary above) so a
  // checkbox toggle here can write back through the same tileStore path
  // Body's own tile uses — keeps this card in sync without needing Body open.
  const [bodyStore, setBodyStore] = useState<Record<string, unknown> | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const [fuelRaw, workoutRaw, goalsRaw, financeRaw, bodyRaw] = await Promise.all([
        tileStore.loadData(userId, 'fuel'),
        tileStore.loadData(userId, 'workout'),
        tileStore.loadData(userId, 'goals'),
        tileStore.loadData(userId, 'finance'),
        tileStore.loadData(userId, 'intake'),
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
      const entries = asArray<{ id?: string; exercise?: string; weight?: number; ts: number }>(workoutStore.entries)
      const weekCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
      const sessionsThisWeek = new Set(entries.filter((e) => e.ts >= weekCutoff).map((e) => workoutDayKey(e.ts))).size
      // Running max per exercise across chronological entries — same PR
      // definition as the Workout tile itself (heaviest weight logged so far).
      const running: Record<string, number> = {}
      const prIds = new Set<string>()
      for (const e of entries.slice().sort((a, b) => a.ts - b.ts)) {
        const k = (e.exercise || '').toLowerCase()
        const prev = running[k] || 0
        const weight = Number(e.weight) || 0
        if (weight >= prev && weight > 0) {
          if (e.id) prIds.add(e.id)
          running[k] = weight
        } else if (running[k] == null) running[k] = weight
      }
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime()
      const prsThisMonth = entries.filter((e) => e.id && prIds.has(e.id) && e.ts >= monthStart).length
      const workout = { prsThisMonth, sessionsThisWeek }

      const goalsStore = asRecord(goalsRaw)
      const shortTerm = asArray<{ done?: boolean }>(goalsStore.shortTerm)
      const longTerm = asArray<{ done?: boolean }>(goalsStore.longTerm)
      const goals = {
        shortDone: shortTerm.filter((g) => g.done).length,
        shortTotal: shortTerm.length,
        longDone: longTerm.filter((g) => g.done).length,
        longTotal: longTerm.length,
      }

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

      const bodyStoreRaw = asRecord(bodyRaw)
      const stackItems = asArray<{ id?: string; name?: string }>(bodyStoreRaw.stack)
        .filter((s): s is StackItem => typeof s.id === 'string' && typeof s.name === 'string')
      const stackChecksAll = asRecord(bodyStoreRaw.stackChecks)
      const stackChecked = asArray<string>(stackChecksAll[fuelTodayKey()])
      const stack = { items: stackItems, checked: stackChecked }

      if (alive) {
        setW({ fuel, workout, goals, finance, calendar, stack })
        setBodyStore(bodyStoreRaw)
      }
    })()
    return () => {
      alive = false
    }
  }, [userId])

  async function toggleStackItem(id: string) {
    if (!bodyStore) return
    const key = fuelTodayKey()
    const checksAll = asRecord(bodyStore.stackChecks)
    const current = asArray<string>(checksAll[key])
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
    const updated = { ...bodyStore, stackChecks: { ...checksAll, [key]: next } }
    setBodyStore(updated)
    setW((prev) => (prev ? { ...prev, stack: prev.stack ? { ...prev.stack, checked: next } : prev.stack } : prev))
    await tileStore.saveData(userId, 'intake', updated)
  }

  if (!w) return null

  return (
    <div className={styles.grid}>
      <div className={styles.card} style={{ ['--ping-delay' as string]: '60ms' }}>
        <div className={styles.cardHead}>
          <span className={styles.cardTitle}>Today&rsquo;s intake</span>
          <span className={styles.cardTag}>Fuel</span>
        </div>
        {w.fuel ? (
          <div className={styles.wheels}>
            <WheelGauge
              pct={(w.fuel.kcal / (w.fuel.kcalGoal || 1)) * 100}
              num={w.fuel.kcal}
              sub={`of ${w.fuel.kcalGoal} kcal`}
              label="Calories"
              over={w.fuel.kcal > w.fuel.kcalGoal}
            />
            <WheelGauge
              pct={(w.fuel.protein / (w.fuel.proteinGoal || 1)) * 100}
              num={w.fuel.protein}
              sub={`of ${w.fuel.proteinGoal}g`}
              label="Protein"
            />
          </div>
        ) : (
          <p className={styles.emptyNote}>Log a meal in Fuel to see today&rsquo;s numbers.</p>
        )}
      </div>

      <div className={styles.card} style={{ ['--ping-delay' as string]: '200ms' }}>
        <div className={styles.cardHead}>
          <span className={styles.cardTitle}>Net worth</span>
          <span className={styles.cardTag}>Finance</span>
        </div>
        {w.finance && (
          <>
            <span className={styles.bigNum}>{w.finance.netWorth.toLocaleString()}</span>
            <Sparkline points={w.finance.history} />
          </>
        )}
      </div>

      <div className={styles.card} style={{ ['--ping-delay' as string]: '260ms' }}>
        <div className={styles.cardHead}>
          <span className={styles.cardTitle}>This week</span>
          <span className={styles.cardTag}>Calendar</span>
        </div>
        {w.calendar?.connected ? (
          <>
            <span className={styles.bigNum}>{w.calendar.dueToday}</span>
            <span className={styles.smallLabel}>Due today{w.calendar.overdue ? ` · ${w.calendar.overdue} overdue` : ''}</span>
          </>
        ) : (
          <p className={styles.emptyNote}>Connect Todoist to see this here.</p>
        )}
      </div>

      <div className={styles.card} style={{ ['--ping-delay' as string]: '380ms' }}>
        <div className={styles.cardHead}>
          <span className={styles.cardTitle}>Goals progress</span>
          <span className={styles.cardTag}>Goals</span>
        </div>
        {w.goals && (
          <div className={styles.bars}>
            <Bar
              label="Short-term"
              pct={w.goals.shortTotal ? (w.goals.shortDone / w.goals.shortTotal) * 100 : 0}
              value={`${w.goals.shortDone} / ${w.goals.shortTotal}`}
            />
            <Bar
              label="Long-term"
              pct={w.goals.longTotal ? (w.goals.longDone / w.goals.longTotal) * 100 : 0}
              value={`${w.goals.longDone} / ${w.goals.longTotal}`}
            />
          </div>
        )}
      </div>

      {/* Pinned to the narrow column via .consistencyCard, right after Goals
          progress — see that class for why explicit placement is needed. */}
      <div className={`${styles.card} ${styles.consistencyCard}`} style={{ ['--ping-delay' as string]: '560ms' }}>
        <div className={styles.cardHead}>
          <span className={styles.cardTitle}>Consistency</span>
          <span className={styles.cardTag}>Workout</span>
        </div>
        {w.workout && <RadialGauge pct={(w.workout.sessionsThisWeek / 7) * 100} label={`${w.workout.prsThisMonth} PRs this mo.`} sub="/ wk" />}
      </div>

      <div className={`${styles.card} ${styles.stackCard}`} style={{ ['--ping-delay' as string]: '440ms' }}>
        <div className={styles.cardHead}>
          <span className={styles.cardTitle}>Daily stack</span>
          <span className={styles.cardTag}>Body</span>
        </div>
        {w.stack && w.stack.items.length ? (
          <div className={styles.stackList}>
            {w.stack.items.map((item) => {
              const done = w.stack!.checked.includes(item.id)
              return (
                <div key={item.id} className={styles.stackRow}>
                  <button
                    type="button"
                    className={`${styles.stackCheckBtn}${done ? ` ${styles.stackCheckBtnDone}` : ''}`}
                    aria-label={done ? `Mark ${item.name} not taken today` : `Mark ${item.name} taken today`}
                    onClick={() => toggleStackItem(item.id)}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 12l5 5L20 6" />
                    </svg>
                  </button>
                  <span className={`${styles.stackItemName}${done ? ` ${styles.stackItemNameDone}` : ''}`}>{item.name}</span>
                </div>
              )
            })}
          </div>
        ) : (
          <p className={styles.emptyNote}>Open Body to add your daily stack.</p>
        )}
      </div>
    </div>
  )
}
