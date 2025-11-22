export const runtime = 'nodejs'

import { put } from '@vercel/blob'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    const data = await req.json()
    const {
      sessionId = 'anon',
      role,
      content,
      ts
    } = data as {
      sessionId?: string
      role?: string
      content?: string
      ts?: string
    }

    if (!role || typeof content !== 'string') {
      return NextResponse.json({ error: 'role and content required' }, { status: 400 })
    }

    const safeSession = String(sessionId).replace(/[^a-z0-9-_]/gi, '-')

    const when = ts ?? new Date().toISOString()
    // strip simple HTML tags
    const plain = content.replace(/<[^>]*>/g, '')
    const entry = JSON.stringify({ role, content: plain, ts: when }) + '\n'

    // write a small per-message object to Vercel Blob so buffering works on serverless
    const itemName = `${Date.now()}-${Math.random().toString(36).slice(2)}.ndjson`
    const pathname = `chat-exports/buffer/${safeSession}/${itemName}`

    const meta = await put(pathname, entry, { access: 'public' })

    return NextResponse.json({ ok: true, path: meta?.pathname || `/${pathname}` })
  } catch (err: any) {
    console.error('buffer log error', err)
    return NextResponse.json({ error: err?.message || 'unknown' }, { status: 500 })
  }
}
