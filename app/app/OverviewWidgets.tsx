'use client'

import { useEffect, useRef, useState } from 'react'
import styles from './OverviewWidgets.module.css'
import { tileStore } from '@/lib/tiles/tileStore'
import { HIDDEN_TILES } from '@/lib/tiles/coreTiles'

const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** This calendar week's 7 dates, Sunday first — display only; an assignment
 *  is keyed by weekday (0-6) below, not by date, so a split set up once
 *  ("push Mon, legs Wed, rest Sun") keeps repeating every week instead of
 *  needing to be re-filled in. */
function thisWeekDates(): Date[] {
  const now = new Date()
  const sunday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay())
  return Array.from({ length: 7 }, (_, i) => new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() + i))
}
function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

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
  training: { days: (string | null)[]; names: string[] } | null
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
function WheelGauge({
  pct,
  num,
  sub,
  label,
  over,
  onFill,
  filled,
  atGoal,
}: {
  pct: number
  num: number
  sub: string
  label: string
  over?: boolean
  /** Same "instantly fill today's goal" action Fuel's own tile offers next
   *  to this same wheel — omit to render the plain label with no button. */
  onFill?: () => void
  /** A quickFill entry from this button is already logged — the button
   *  reverses it instead of adding another (see toggleFillGoal). */
  filled?: boolean
  /** Real food already at/over goal with nothing of ours to undo — the only
   *  case the button goes inert. */
  atGoal?: boolean
}) {
  const cx = 50, cy = 50, r = 42
  const clamped = clamp(pct, 0, 100) / 100
  // Always drawn, even at 0 (a valid, invisible zero-length arc) — pct
  // arrives already mid-animation while a fill/undo is in flight (see
  // toggleFillGoal), so there's no "should this exist yet" gap to paper over.
  const d = arcPathCCW(cx, cy, r, clamped)
  return (
    <div className={styles.wheelWrap}>
      <svg viewBox="0 0 100 100" className={styles.wheelSvg}>
        <circle cx={cx} cy={cy} r={r} className={styles.wheelTrack} />
        <path d={d} className={over ? `${styles.wheelFill} ${styles.wheelFillOver}` : styles.wheelFill} />
      </svg>
      <div className={styles.wheelCenter}>
        <span className={styles.wheelNum}>{num}</span>
        <span className={styles.wheelSub}>{sub}</span>
      </div>
      <div className={styles.wheelFoot}>
        <span className={styles.wheelLabel}>{label}</span>
        {onFill && (
          <button
            type="button"
            className={`${styles.fillBtn}${filled ? ` ${styles.undoBtn}` : ''}`}
            onClick={onFill}
            disabled={!filled && atGoal}
            title={filled ? 'Undo the instant fill' : `Instantly fill today’s ${label.toLowerCase()} goal`}
          >
            {filled ? '↺ Undo' : atGoal ? 'Filled' : '⚡ Fill'}
          </button>
        )}
      </div>
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

/* Weekly training planner: a Sun-Sat strip of day pills, each a native
   <select> doubling as both the "pick a workout" button and the populated
   label once one's chosen — simplest control that gives a real click-a-list
   UX for free. `names` comes from Workout's own saved sessions (store.sessions
   in workout.html), so the list is always whatever's actually been built and
   named there. */
function WeekPlanner({
  days,
  names,
  onAssign,
}: {
  days: (string | null)[]
  names: string[]
  onAssign: (dayIdx: number, value: string | null) => void
}) {
  const dates = thisWeekDates()
  const today = new Date()
  return (
    <div className={styles.weekGrid}>
      {dates.map((date, i) => {
        const assigned = days[i] ?? null
        const isRest = assigned === 'Rest day'
        const isKnown = assigned == null || isRest || names.includes(assigned)
        return (
          <div key={i} className={`${styles.dayCol}${isSameDay(date, today) ? ` ${styles.dayColToday}` : ''}`}>
            <span className={styles.dayAbbrev}>{DAY_ABBR[i]}</span>
            <span className={styles.dayNum}>{date.getDate()}</span>
            <select
              className={`${styles.daySelect}${isRest ? ` ${styles.daySelectRest}` : assigned ? ` ${styles.daySelectSet}` : ''}`}
              value={assigned ?? ''}
              onChange={(e) => onAssign(i, e.target.value || null)}
            >
              <option value="">Set day</option>
              <option value="Rest day">Rest day</option>
              {names.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
              {/* A previously-assigned workout that's since been renamed or
                  deleted in Workout — keeps showing what's actually saved
                  instead of silently reverting to "Set day". */}
              {!isKnown && assigned && <option value={assigned}>{assigned} (removed)</option>}
            </select>
          </div>
        )
      })}
    </div>
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

export default function OverviewWidgets({
  userId,
  // True while an open tile covers the whole page. Stays mounted (not
  // display:none-less unmounted) regardless — this component used to live
  // behind a conditional that unmounted it every time a tile opened, so
  // returning to Home re-ran its data-fetch effect from scratch (5 tiles,
  // each a Supabase round-trip when sync is on) every single time. hidden
  // keeps it inert instead of tearing all that down and rebuilding it.
  hidden,
}: {
  userId: string
  hidden?: boolean
}) {
  const [w, setW] = useState<Widgets | null>(null)
  // Full raw Body store (not just the derived stack summary above) so a
  // checkbox toggle here can write back through the same tileStore path
  // Body's own tile uses — keeps this card in sync without needing Body open.
  const [bodyStore, setBodyStore] = useState<Record<string, unknown> | null>(null)
  // Same idea for Fuel: the "instantly fill" buttons need the full raw store
  // (today's log array, not just the derived kcal/protein totals above) so
  // they can push a synthetic entry the exact way fuel.html's own fill
  // buttons do and write back through the same tileStore path.
  const [fuelStore, setFuelStore] = useState<Record<string, unknown> | null>(null)
  // The Training planner's own raw store (its one field, `days`) — same
  // round-trip-without-refetch pattern as bodyStore/fuelStore above.
  const [trainingStore, setTrainingStore] = useState<Record<string, unknown> | null>(null)
  // Mid-animation override for a wheel's arc/number — set while a fill/undo
  // is playing (see animateWheel), cleared once it lands on the real value.
  const [wheelAnim, setWheelAnim] = useState<{ cal?: { pct: number; num: number }; protein?: { pct: number; num: number } }>({})
  const animatingRef = useRef<{ cal?: boolean; protein?: boolean }>({})

  useEffect(() => {
    let alive = true
    ;(async () => {
      const [fuelRaw, workoutRaw, goalsRaw, financeRaw, bodyRaw, trainingRaw] = await Promise.all([
        tileStore.loadData(userId, 'fuel'),
        tileStore.loadData(userId, 'workout'),
        tileStore.loadData(userId, 'goals'),
        tileStore.loadData(userId, 'finance'),
        tileStore.loadData(userId, 'intake'),
        tileStore.loadData(userId, 'training'),
      ])

      const fuelStoreRaw = asRecord(fuelRaw)
      const todaysLog = asArray<{ cal?: number; p?: number }>(fuelStoreRaw[fuelTodayKey()])
      const fuel = {
        kcal: Math.round(todaysLog.reduce((s, e) => s + (Number(e.cal) || 0), 0)),
        // Matches Fuel's own default (goalCal() in fuel.html) — a mismatched
        // fallback here made this wheel look "over goal" for anyone who'd
        // never actually touched the calorie stepper on either side.
        kcalGoal: typeof fuelStoreRaw.goalCal === 'number' ? fuelStoreRaw.goalCal : 3000,
        protein: Math.round(todaysLog.reduce((s, e) => s + (Number(e.p) || 0), 0)),
        proteinGoal: typeof fuelStoreRaw.goalProtein === 'number' ? fuelStoreRaw.goalProtein : 150,
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

      // Named sessions built in Workout (workout.html's store.sessions) — the
      // list Training's day pickers offer, so it's always whatever's
      // actually been built there, never a separate copy to keep in sync.
      const sessionNames = asArray<{ id?: string; name?: string }>(workoutStore.sessions)
        .map((s) => (typeof s.name === 'string' ? s.name.trim() : ''))
        .filter(Boolean)

      const trainingStoreRaw = asRecord(trainingRaw)
      const trainingDaysRaw = asArray<string | null>(trainingStoreRaw.days)
      const trainingDays = Array.from({ length: 7 }, (_, i) => (typeof trainingDaysRaw[i] === 'string' ? trainingDaysRaw[i] : null))
      const training = { days: trainingDays, names: sessionNames }

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
      // Calendar's own card is hidden (see HIDDEN_TILES) — no point spending
      // a network round-trip on a card that won't render.
      try {
        const res = HIDDEN_TILES.includes('todoist') ? null : await fetch('/api/todoist/tasks', { cache: 'no-store' })
        if (res?.ok) {
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
        setW({ fuel, workout, goals, finance, calendar, stack, training })
        setBodyStore(bodyStoreRaw)
        setFuelStore(fuelStoreRaw)
        setTrainingStore(trainingStoreRaw)
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

  /** Assigns (or clears, via null) one weekday's training slot. Writes
   *  through the same tileStore path every other card here uses, under a
   *  new 'training' tile id — Training has no sealed tile of its own, it's
   *  entirely this homepage card, so this is its one and only data store. */
  async function assignDay(dayIdx: number, value: string | null) {
    // Derives from the functional-update `prev`, not the trainingStore
    // closed over at render time — tapping two days in quick succession
    // (before the first write's re-render lands) used to read the same
    // stale base twice, so the second write silently clobbered the first.
    let updated: Record<string, unknown> = {}
    setTrainingStore((prev) => {
      const base = prev ?? {}
      const daysRaw = asArray<string | null>(base.days)
      const nextDays = Array.from({ length: 7 }, (_, i) => (i === dayIdx ? value : typeof daysRaw[i] === 'string' ? daysRaw[i] : null))
      updated = { ...base, days: nextDays }
      return updated
    })
    setW((prev) => {
      if (!prev || !prev.training) return prev
      const nextDays = prev.training.days.map((d, i) => (i === dayIdx ? value : d))
      return { ...prev, training: { ...prev.training, days: nextDays } }
    })
    await tileStore.saveData(userId, 'training', updated)
  }

  type FuelLogEntry = { name?: string; grams?: number; cal?: number; p?: number; c?: number; f?: number; quickFill?: string }
  function fuelQuickFillEntry(kind: 'cal' | 'protein'): FuelLogEntry | undefined {
    if (!fuelStore) return undefined
    return asArray<FuelLogEntry>(fuelStore[fuelTodayKey()]).find((e) => e.quickFill === kind)
  }

  /* Drives a wheel's arc + center number from one value straight to another
     over a short ease-out (matches fuel.html's own animateWheel — same
     duration/easing so the two feel identical), then hands off to onDone
     to make the real data change. A ref (not state) guards re-entrancy so a
     rapid second click can't start a race with the running rAF loop. */
  function animateWheel(kind: 'cal' | 'protein', fromPct: number, toPct: number, fromNum: number, toNum: number, onDone: () => void) {
    if (animatingRef.current[kind]) return
    const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) {
      onDone()
      return
    }
    animatingRef.current[kind] = true
    const dur = 650
    const t0 = performance.now()
    function frame(now: number) {
      const t = Math.min(1, (now - t0) / dur)
      const eased = 1 - Math.pow(1 - t, 3)
      setWheelAnim((prev) => ({ ...prev, [kind]: { pct: fromPct + (toPct - fromPct) * eased, num: Math.round(fromNum + (toNum - fromNum) * eased) } }))
      if (t < 1) {
        requestAnimationFrame(frame)
      } else {
        animatingRef.current[kind] = false
        setWheelAnim((prev) => {
          const next = { ...prev }
          delete next[kind]
          return next
        })
        onDone()
      }
    }
    requestAnimationFrame(frame)
  }

  /* "Instantly fill" a wheel: logs one synthetic entry that closes the exact
     gap to today's goal, the same way fuel.html's own fill buttons do (and
     into the exact same today-keyed log array, tagged quickFill so it can be
     found again), so Fuel — opened separately — shows the identical result.
     Clicking a filled wheel's button again removes exactly that entry,
     restoring whatever the total was before, regardless of anything else
     logged in between. */
  async function toggleFillGoal(kind: 'cal' | 'protein') {
    if (!fuelStore || !w?.fuel || animatingRef.current[kind]) return
    const key = fuelTodayKey()
    const log = asArray<FuelLogEntry>(fuelStore[key])
    const entry = log.find((e) => e.quickFill === kind)
    const goal = kind === 'cal' ? w.fuel.kcalGoal : w.fuel.proteinGoal
    const fromVal = kind === 'cal' ? w.fuel.kcal : w.fuel.protein
    const fromPct = goal > 0 ? (fromVal / goal) * 100 : 0

    if (entry) {
      const amt = kind === 'cal' ? entry.cal || 0 : entry.p || 0
      const toVal = fromVal - amt
      const toPct = goal > 0 ? (toVal / goal) * 100 : 0
      animateWheel(kind, fromPct, toPct, fromVal, toVal, async () => {
        const updated = { ...fuelStore, [key]: log.filter((e) => e.quickFill !== kind) }
        setFuelStore(updated)
        setW((prev) => (prev && prev.fuel ? { ...prev, fuel: kind === 'cal' ? { ...prev.fuel, kcal: toVal } : { ...prev.fuel, protein: toVal } } : prev))
        await tileStore.saveData(userId, 'fuel', updated)
      })
    } else {
      const remaining = Math.round(goal - fromVal)
      if (remaining <= 0) return
      animateWheel(kind, fromPct, goal > 0 ? 100 : 0, fromVal, goal, async () => {
        const newEntry: FuelLogEntry =
          kind === 'cal' ? { name: 'Quick fill', grams: 0, cal: remaining, p: 0, c: 0, f: 0, quickFill: 'cal' } : { name: 'Quick fill', grams: 0, cal: 0, p: remaining, c: 0, f: 0, quickFill: 'protein' }
        const updated = { ...fuelStore, [key]: [...log, newEntry] }
        setFuelStore(updated)
        setW((prev) => (prev && prev.fuel ? { ...prev, fuel: kind === 'cal' ? { ...prev.fuel, kcal: goal } : { ...prev.fuel, protein: goal } } : prev))
        await tileStore.saveData(userId, 'fuel', updated)
      })
    }
  }

  if (!w) return null

  return (
    <div className={styles.grid} style={hidden ? { display: 'none' } : undefined}>
      {/* Fuel, Calendar, and Body's cards are pulled per HIDDEN_TILES below —
          removing an id there (see lib/tiles/coreTiles.tsx) brings each
          straight back here, no other change needed. */}
      {!HIDDEN_TILES.includes('fuel') && (
        <div className={styles.card} style={{ ['--ping-delay' as string]: '60ms' }}>
          <div className={styles.cardHead}>
            <span className={styles.cardTitle}>Today&rsquo;s intake</span>
            <span className={styles.cardTag}>Fuel</span>
          </div>
          {w.fuel ? (
            <div className={styles.wheels}>
              <WheelGauge
                pct={wheelAnim.cal ? wheelAnim.cal.pct : (w.fuel.kcal / (w.fuel.kcalGoal || 1)) * 100}
                num={wheelAnim.cal ? wheelAnim.cal.num : w.fuel.kcal}
                sub={`of ${w.fuel.kcalGoal} kcal`}
                label="Calories"
                over={(wheelAnim.cal ? wheelAnim.cal.num : w.fuel.kcal) > w.fuel.kcalGoal}
                onFill={() => toggleFillGoal('cal')}
                filled={!!fuelQuickFillEntry('cal')}
                atGoal={w.fuel.kcal >= w.fuel.kcalGoal}
              />
              <WheelGauge
                pct={wheelAnim.protein ? wheelAnim.protein.pct : (w.fuel.protein / (w.fuel.proteinGoal || 1)) * 100}
                num={wheelAnim.protein ? wheelAnim.protein.num : w.fuel.protein}
                sub={`of ${w.fuel.proteinGoal}g`}
                label="Protein"
                onFill={() => toggleFillGoal('protein')}
                filled={!!fuelQuickFillEntry('protein')}
                atGoal={w.fuel.protein >= w.fuel.proteinGoal}
              />
            </div>
          ) : (
            <p className={styles.emptyNote}>Log a meal in Fuel to see today&rsquo;s numbers.</p>
          )}
        </div>
      )}

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

      {!HIDDEN_TILES.includes('todoist') && (
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
      )}

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

      <div className={styles.card} style={{ ['--ping-delay' as string]: '560ms' }}>
        <div className={styles.cardHead}>
          <span className={styles.cardTitle}>Consistency</span>
          <span className={styles.cardTag}>Workout</span>
        </div>
        {w.workout && <RadialGauge pct={(w.workout.sessionsThisWeek / 7) * 100} label={`${w.workout.prsThisMonth} PRs this mo.`} sub="/ wk" />}
      </div>

      {!HIDDEN_TILES.includes('intake') && (
        <div className={styles.card} style={{ ['--ping-delay' as string]: '440ms' }}>
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
      )}

      {/* Reference tile: pulls its day-picker options from Workout's own
          named sessions (see sessionNames above) and writes assignments
          straight through tileStore under a new 'training' id — no sealed
          tile of its own, this card is the whole thing. Spans both columns
          (see .trainingCard) since 7 day-pills need the full card width. */}
      <div className={`${styles.card} ${styles.trainingCard}`} style={{ ['--ping-delay' as string]: '620ms' }}>
        <div className={styles.cardHead}>
          <span className={styles.cardTitle}>Training</span>
          <span className={styles.cardTag}>Workout</span>
        </div>
        {w.training && <WeekPlanner days={w.training.days} names={w.training.names} onAssign={assignDay} />}
      </div>
    </div>
  )
}
