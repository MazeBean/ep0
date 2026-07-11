import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const API = 'https://api.todoist.com/api/v1'

function token(): string | null {
  return process.env.TODOIST_TOKEN || null
}

/** Complete a task — POST /api/todoist/tasks/:id (Todoist's close endpoint
 *  returns 204 with no body on success). */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = token()
  if (!t) return NextResponse.json({ error: 'todoist_not_configured' }, { status: 503 })

  const { id } = await params
  const res = await fetch(`${API}/tasks/${encodeURIComponent(id)}/close`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${t}` },
  })
  if (!res.ok) return NextResponse.json({ error: 'todoist_complete_failed' }, { status: 502 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = token()
  if (!t) return NextResponse.json({ error: 'todoist_not_configured' }, { status: 503 })

  const { id } = await params
  const res = await fetch(`${API}/tasks/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${t}` },
  })
  if (!res.ok) return NextResponse.json({ error: 'todoist_delete_failed' }, { status: 502 })
  return NextResponse.json({ ok: true })
}
