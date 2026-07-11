import { NextResponse } from 'next/server'

/**
 * Todoist proxy — list + create tasks.
 *
 * A sealed tile has no network, so it can't call Todoist directly. This route
 * runs server-side (real network) holding the token privately; the dashboard's
 * own page (not the tile) calls it via the tile bridge — see
 * lib/tiles/tileBridge.ts + lib/tiles/useTileHost.ts.
 *
 * Setup: add TODOIST_TOKEN (Todoist → Settings → Integrations → Developer →
 * API token) as an env var. Without it this route returns 503.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const API = 'https://api.todoist.com/rest/v2'

function token(): string | null {
  return process.env.TODOIST_TOKEN || null
}

export async function GET() {
  const t = token()
  if (!t) return NextResponse.json({ error: 'todoist_not_configured' }, { status: 503 })

  const res = await fetch(`${API}/tasks`, {
    headers: { Authorization: `Bearer ${t}` },
    cache: 'no-store',
  })
  if (!res.ok) return NextResponse.json({ error: 'todoist_fetch_failed' }, { status: 502 })

  const tasks = await res.json()
  const trimmed = (Array.isArray(tasks) ? tasks : []).map((task: Record<string, unknown>) => ({
    id: task.id,
    content: task.content,
    due: (task.due as { date?: string; datetime?: string } | null)?.datetime
      ?? (task.due as { date?: string } | null)?.date
      ?? null,
    priority: task.priority,
    url: task.url,
  }))
  return NextResponse.json(trimmed)
}

export async function POST(req: Request) {
  const t = token()
  if (!t) return NextResponse.json({ error: 'todoist_not_configured' }, { status: 503 })

  const body = await req.json().catch(() => null)
  const content = typeof body?.content === 'string' ? body.content.trim() : ''
  if (!content) return NextResponse.json({ error: 'content_required' }, { status: 400 })

  const res = await fetch(`${API}/tasks`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content,
      due_string: typeof body?.due === 'string' && body.due.trim() ? body.due.trim() : undefined,
    }),
  })
  if (!res.ok) return NextResponse.json({ error: 'todoist_create_failed' }, { status: 502 })

  const task = await res.json()
  return NextResponse.json({
    id: task.id,
    content: task.content,
    due: task.due?.datetime ?? task.due?.date ?? null,
    priority: task.priority,
    url: task.url,
  })
}
