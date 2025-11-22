export const runtime = 'nodejs'

import { put, list, del } from '@vercel/blob'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    const data = await req.json()
    const { sessionId = 'anon' } = data as { sessionId?: string }

    const safeSession = String(sessionId).replace(/[^a-z0-9-_]/gi, '-')

    // list buffer blobs for this session
    const listRes = await list({ prefix: `chat-exports/buffer/${safeSession}/` })
    const blobs = (listRes?.blobs || [])

    if (!blobs.length) {
      return NextResponse.json({ ok: true, message: 'no buffer to flush' })
    }

    // sort by uploadedAt to preserve order
    blobs.sort((a: any, b: any) => new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime())

    // fetch each blob's content
    let combined = ''
    for (const b of blobs) {
      try {
        const url = b.downloadUrl || b.url || b.pathname
        if (!url) continue
        const resp = await fetch(url)
        if (resp.ok) {
          const text = await resp.text()
          combined += text + '\n'
        }
      } catch (e) {
        // ignore individual fetch errors
      }
    }

    // Option: write a single export file per flush with timestamp
    const exportName = `exports/${safeSession}/${Date.now()}.txt`

    // For NDJSON, convert each line to a human-readable line
    const lines = combined
      .split('\n')
      .filter(Boolean)
      .map((ln) => {
        try {
          const obj = JSON.parse(ln)
          const who = obj.role === 'assistant' ? 'GPT' : obj.role === 'vote' ? 'Vote' : 'User'
          const when = obj.ts || new Date().toISOString()
          const plain = (obj.content || '').replace(/<[^>]*>/g, '')
          return `[${when}] ${who}: ${plain}`
        } catch {
          return ln
        }
      })
      .join('\n')

    // put export file
    await put(`chat-exports/${exportName}`, lines + '\n', { access: 'public', allowOverwrite: true })

    // delete the buffer blobs
    try {
      const paths = blobs.map((b: any) => b.pathname || b.url || b.path).filter(Boolean)
      if (paths.length) await del(paths)
    } catch (e) {
      // non-fatal
      console.warn('failed to delete buffer blobs', e)
    }

    return NextResponse.json({ ok: true, path: `/chat-exports/${exportName}` })
  } catch (err: any) {
    console.error('flush log error', err)
    return NextResponse.json({ error: err?.message || 'unknown' }, { status: 500 })
  }
}
