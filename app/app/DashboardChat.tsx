'use client'

import { useEffect, useRef, useState } from 'react'
import styles from './DashboardChat.module.css'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
}

function storageKey(userId: string) {
  return `vitality:${userId}:claudeChat`
}

function loadMessages(userId: string): ChatMessage[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(storageKey(userId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveMessages(userId: string, messages: ChatMessage[]) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(messages))
  } catch {
    /* quota or blocked — fail quiet, same as the tile store */
  }
}

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

/**
 * A persistent text box in the dashboard chrome — always on screen, not
 * tucked inside a tile you have to open. Talks to the real Claude API via
 * app/api/claude/chat (server-side, holds the key privately). History
 * persists to localStorage the same way tile data and chrome settings do.
 */
export default function DashboardChat({ userId }: { userId: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setMessages(loadMessages(userId))
  }, [userId])

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages, sending])

  async function send() {
    const text = input.trim()
    if (!text || sending) return
    const userMsg: ChatMessage = { id: newId(), role: 'user', content: text }
    const next = [...messages, userMsg]
    setMessages(next)
    saveMessages(userId, next)
    setInput('')
    setError(null)
    setSending(true)
    try {
      const res = await fetch('/api/claude/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next.map((m) => ({ role: m.role, content: m.content })) }),
      })
      if (res.status === 503) {
        setError('Add ANTHROPIC_API_KEY to enable chat.')
        return
      }
      if (!res.ok) {
        setError('Something went wrong. Try again.')
        return
      }
      const data = await res.json()
      const replyMsg: ChatMessage = { id: newId(), role: 'assistant', content: data.reply || '' }
      const withReply = [...next, replyMsg]
      setMessages(withReply)
      saveMessages(userId, withReply)
    } catch {
      setError('Something went wrong. Try again.')
    } finally {
      setSending(false)
    }
  }

  function clear() {
    setMessages([])
    saveMessages(userId, [])
    setError(null)
  }

  return (
    <div className={styles.wrap}>
      {messages.length > 0 && (
        <div className={styles.panel}>
          <div className={styles.panelHead}>
            <span className={styles.panelLabel}>claude</span>
            <button type="button" className={styles.clearBtn} onClick={clear}>
              clear
            </button>
          </div>
          <div className={styles.list} ref={listRef}>
            {messages.map((m) => (
              <div key={m.id} className={m.role === 'user' ? styles.msgUser : styles.msgAssistant}>
                {m.content}
              </div>
            ))}
            {sending && <div className={styles.msgAssistant}>…</div>}
          </div>
        </div>
      )}
      {error && <div className={styles.error}>{error}</div>}
      <div className={styles.bar}>
        <input
          className={styles.input}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              send()
            }
          }}
          placeholder="ask claude, or tell it something"
        />
        <button
          type="button"
          className={styles.sendBtn}
          onClick={send}
          disabled={sending || !input.trim()}
          aria-label="Send"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
      </div>
    </div>
  )
}
