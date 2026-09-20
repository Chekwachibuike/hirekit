import { NextResponse } from 'next/server'
import { AI_MODELS } from '@/lib/ai/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Lists the models this Groq key can actually use, and flags whether the ones
// wired into AI_MODELS are among them.
//
// Groq retires models on its own schedule, and when it does, every AI feature
// fails at once with a 404 that surfaced as "Generation failed" — identical to
// a bad key or a rate limit. This makes the difference visible in one request
// instead of requiring a debugging session.
export async function GET() {
  const key = process.env.GROQ_API_KEY
  if (!key) {
    return NextResponse.json({ error: 'GROQ_API_KEY is not set' }, { status: 500 })
  }

  try {
    const res = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { Authorization: `Bearer ${key}` },
      cache: 'no-store',
    })
    if (!res.ok) {
      return NextResponse.json(
        { error: `Groq returned ${res.status}`, hint: res.status === 401 ? 'The API key was rejected.' : undefined },
        { status: 502 },
      )
    }

    const body = await res.json()
    const available: string[] = (body.data ?? []).map((m: { id: string }) => m.id).sort()

    const configured = Object.entries(AI_MODELS).map(([role, id]) => ({
      role, id, available: available.includes(id),
    }))

    return NextResponse.json({
      configured,
      allConfiguredAvailable: configured.every(c => c.available),
      available,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    )
  }
}
