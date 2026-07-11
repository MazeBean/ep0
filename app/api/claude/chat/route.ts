import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

/**
 * Claude chat — the persistent text box in the dashboard chrome.
 *
 * Server-side only: holds ANTHROPIC_API_KEY privately and calls the real
 * Messages API. The client sends the full conversation each time (stateless);
 * we don't persist chat history server-side — the client owns that (see
 * DashboardChat.tsx, which keeps it in localStorage the same way tile data
 * and chrome settings are stored).
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MODEL = 'claude-haiku-4-5'
const MAX_TOKENS = 1024

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

function client(): Anthropic | null {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return null
  return new Anthropic({ apiKey: key })
}

export async function POST(req: Request) {
  const anthropic = client()
  if (!anthropic) return NextResponse.json({ error: 'claude_not_configured' }, { status: 503 })

  const body = await req.json().catch(() => null)
  const messages = Array.isArray(body?.messages) ? (body.messages as ChatMessage[]) : null
  if (!messages || messages.length === 0) {
    return NextResponse.json({ error: 'messages_required' }, { status: 400 })
  }

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    })

    // Check stop_reason before reading content — a refusal's content may be
    // empty or partial, and reading it unconditionally can throw.
    if (response.stop_reason === 'refusal') {
      return NextResponse.json({ reply: "I can't help with that one." })
    }

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n')

    return NextResponse.json({ reply: text })
  } catch (err) {
    // Most-specific exception class first — see error-codes reference.
    if (err instanceof Anthropic.AuthenticationError) {
      return NextResponse.json({ error: 'invalid_api_key' }, { status: 401 })
    }
    if (err instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
    }
    if (err instanceof Anthropic.APIError) {
      return NextResponse.json({ error: 'claude_api_error', message: err.message }, { status: 502 })
    }
    return NextResponse.json({ error: 'claude_request_failed' }, { status: 502 })
  }
}
