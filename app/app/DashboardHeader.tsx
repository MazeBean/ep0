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
interface WeatherState {
  tempF: number
  humidity: number
  sunset: string
  code: number
}

/** Open-Meteo needs no API key and allows unauthenticated browser calls, so
 *  this fetches straight from the client — no server route to maintain. */
async function fetchWeather(lat: number, lon: number): Promise<WeatherState> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,relative_humidity_2m,weather_code&daily=sunset` +
    `&temperature_unit=fahrenheit&timezone=auto`
  const res = await fetch(url)
  if (!res.ok) throw new Error('weather fetch failed')
  const data = await res.json()
  return {
    tempF: Math.round(data.current.temperature_2m),
    humidity: Math.round(data.current.relative_humidity_2m),
    sunset: data.daily.sunset[0],
    code: data.current.weather_code,
  }
}

/** Open-Meteo/WMO weather codes collapsed into a handful of icon families. */
function weatherKind(code: number): 'clear' | 'cloudy' | 'fog' | 'rain' | 'snow' | 'storm' {
  if (code === 0) return 'clear'
  if (code === 1 || code === 2 || code === 3) return 'cloudy'
  if (code === 45 || code === 48) return 'fog'
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain'
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow'
  if (code === 95 || code === 96 || code === 99) return 'storm'
  return 'cloudy'
}

function WeatherIcon({ code }: { code: number }) {
  const kind = weatherKind(code)
  const common = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  if (kind === 'clear') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="4.2" />
        <path d="M12 2.5v2.4M12 19.1v2.4M21.5 12h-2.4M4.9 12H2.5M18.4 5.6l-1.7 1.7M7.3 16.7l-1.7 1.7M18.4 18.4l-1.7-1.7M7.3 7.3 5.6 5.6" />
      </svg>
    )
  }
  if (kind === 'rain') {
    return (
      <svg {...common}>
        <path d="M7 15.5a4.2 4.2 0 0 1 .8-8.3 5.3 5.3 0 0 1 10.2 1.4A3.7 3.7 0 0 1 17.3 16H7Z" />
        <path d="M9 18.5 8 21M13 18.5 12 21M17 18.5 16 21" />
      </svg>
    )
  }
  if (kind === 'snow') {
    return (
      <svg {...common}>
        <path d="M7 14.8a4.2 4.2 0 0 1 .8-8.3 5.3 5.3 0 0 1 10.2 1.4A3.7 3.7 0 0 1 17.3 15.3H7Z" />
        <path d="M9 18v3.2M9 19.6 7.3 21M9 19.6l1.7 1.4M15 18v3.2M15 19.6l-1.7 1.4M15 19.6l1.7 1.4" />
      </svg>
    )
  }
  if (kind === 'storm') {
    return (
      <svg {...common}>
        <path d="M7 13.8a4.2 4.2 0 0 1 .8-8.3 5.3 5.3 0 0 1 10.2 1.4A3.7 3.7 0 0 1 17.3 14.3H7Z" />
        <path d="M13 15.5 10.5 19h3L11 22.5" />
      </svg>
    )
  }
  if (kind === 'fog') {
    return (
      <svg {...common}>
        <path d="M6 10.5a4.2 4.2 0 0 1 .8-8.1M20 10.5H6" />
        <path d="M4 14.5h16M4 18.5h16" />
      </svg>
    )
  }
  return (
    <svg {...common}>
      <path d="M7 16a4.2 4.2 0 0 1 .8-8.3 5.3 5.3 0 0 1 10.2 1.4A3.7 3.7 0 0 1 17.3 16.5H7Z" />
    </svg>
  )
}

/** Each weather family gets its own accent so the icon row reads at a glance
 *  instead of everything sitting in the same muted grey. */
const WEATHER_KIND_COLOR: Record<ReturnType<typeof weatherKind>, string> = {
  clear: '#fbbf24',
  cloudy: '#94a3b8',
  fog: '#9ca3af',
  rain: '#60a5fa',
  snow: '#bae6fd',
  storm: '#a78bfa',
}

function DropletIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2.7c3.4 4.2 5.8 7.6 5.8 10.8a5.8 5.8 0 0 1-11.6 0c0-3.2 2.4-6.6 5.8-10.8Z" />
    </svg>
  )
}

function SunsetIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 15.5a5 5 0 0 0-10 0" />
      <path d="M12 4v5.5" />
      <path d="M9 7l3 3 3-3" />
      <path d="M3 15.5h18" />
    </svg>
  )
}

export default function DashboardHeader({ firstName, greeting, date }: DashboardHeaderProps) {
  const g = greeting ?? DEFAULT_CHROME.greeting
  const d = date ?? DEFAULT_CHROME.date
  const [autoWord, setAutoWord] = useState('')
  const [isBedtime, setIsBedtime] = useState(false)
  const [fullDate, setFullDate] = useState('')
  const [todayDate, setTodayDate] = useState('')
  const [clock, setClock] = useState('')
  const [weather, setWeather] = useState<WeatherState | null>(null)
  const [weatherStatus, setWeatherStatus] = useState<'loading' | 'ok' | 'unavailable'>('loading')
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

  // Weather for the user's own location — needs geolocation permission.
  // Fails quiet: if it's denied or the fetch errors, the hero just shows
  // the greeting + clock with no weather row.
  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setWeatherStatus('unavailable')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        fetchWeather(pos.coords.latitude, pos.coords.longitude)
          .then((w) => {
            setWeather(w)
            setWeatherStatus('ok')
          })
          .catch(() => setWeatherStatus('unavailable'))
      },
      () => setWeatherStatus('unavailable'),
      { timeout: 10000 },
    )
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
  const sunsetText = weather
    ? new Date(weather.sunset).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : null

  const segments: { text: string; accent?: boolean }[] = [{ text: word }]
  if (renderName) {
    segments.push({ text: ', ' }, { text: firstName as string, accent: !!g.accentName })
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
        {weatherStatus === 'ok' && weather && (
          <>
            <span className={styles.heroDot} aria-hidden>·</span>
            <span className={styles.heroWeatherIcon} style={{ color: WEATHER_KIND_COLOR[weatherKind(weather.code)] }} aria-hidden>
              <WeatherIcon code={weather.code} />
            </span>
            <span className={styles.heroStat}>{weather.tempF}°F</span>
            <span className={styles.heroDot} aria-hidden>·</span>
            <span className={`${styles.heroWeatherIcon} ${styles.heroIconHumidity}`} aria-hidden>
              <DropletIcon />
            </span>
            <span className={styles.heroStat}>{weather.humidity}%</span>
            {sunsetText && (
              <>
                <span className={styles.heroDot} aria-hidden>·</span>
                <span className={`${styles.heroWeatherIcon} ${styles.heroIconSunset}`} aria-hidden>
                  <SunsetIcon />
                </span>
                <span className={styles.heroStat}>{sunsetText}</span>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
