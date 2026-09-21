import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseRouteHandlerClient } from '@/lib/supabase-server'
import { generate, parseJsonResponse, AI_MODELS, describeAiError } from '@/lib/ai/client'
import {
  computeStreak, monthlyReport, currentMonth, type Attempt,
} from '@/lib/practice-analytics'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/practice/analytics?month=2026-09&suggest=1
//
// Streak + monthly report from practice_attempts. `suggest=1` additionally
// asks the model what to study next; it is opt-in because it costs an AI call
// and the numbers are useful on their own.
export async function GET(req: NextRequest) {
  const supabase = createSupabaseRouteHandlerClient(req)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params = new URL(req.url).searchParams
  const month = params.get('month') ?? currentMonth()
  const wantSuggestions = params.get('suggest') === '1'

  const { data, error } = await supabase
    .from('practice_attempts')
    .select('id,kind,role,topic,question,score,created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1000)

  if (error) {
    if (error.code === '42P01') {
      return NextResponse.json(
        { error: 'Practice history table is missing — run supabase/migrations/009_practice_attempts.sql.' },
        { status: 500 },
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const attempts = (data ?? []) as Attempt[]
  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  const streak = computeStreak(attempts, today)
  const report = monthlyReport(attempts, month)

  if (!wantSuggestions || attempts.length === 0) {
    return NextResponse.json({ streak, report, totalAttempts: attempts.length, suggestions: null })
  }

  // The model is given the computed numbers, not the raw rows: it is being
  // asked what to study, not to do the arithmetic — which it would do less
  // reliably than the code above, and inconsistently between calls.
  try {
    const prompt = `A candidate is practising technical interview questions. Here is their record for ${report.month}.

Overall: ${report.attempts} answers, average ${report.average}/10${
      report.previousAverage !== null ? ` (previous month: ${report.previousAverage}/10)` : ''
    }

Improved topics: ${report.improved.map(s => `${s.topic} ${s.previousAverage}→${s.average}`).join('; ') || 'none'}
Declined topics: ${report.declined.map(s => `${s.topic} ${s.previousAverage}→${s.average}`).join('; ') || 'none'}
Weakest now: ${report.weakest.map(s => `${s.topic} ${s.average}/10 over ${s.attempts} answer(s)`).join('; ') || 'none'}
Practised previously but not this month: ${report.unpractised.join('; ') || 'none'}

Return ONLY valid JSON with no markdown fences:
{
  "summary": "2-3 sentences on where they actually stand. Be specific and honest; do not congratulate a rising average that comes from dropping hard topics.",
  "focus": [
    { "topic": "SQL indexing", "why": "one sentence on why this is the priority", "study": ["a concrete thing to study or practise", "another"] }
  ]
}

Give 2-4 focus entries, hardest-hitting first. Prefer topics that declined or
score lowest. If a topic was dropped rather than improved, say so.`

    const raw = await generate(prompt, { model: AI_MODELS.pro, temperature: 0.4, maxTokens: 900 })
    const suggestions = parseJsonResponse<{
      summary: string
      focus: { topic: string; why: string; study: string[] }[]
    }>(raw)

    return NextResponse.json({ streak, report, totalAttempts: attempts.length, suggestions })
  } catch (err) {
    console.error('[practice/analytics → suggest]', err)
    // The numbers are the point; suggestions are a bonus that must not take
    // the page down with them.
    return NextResponse.json({
      streak, report, totalAttempts: attempts.length,
      suggestions: null, suggestionError: describeAiError(err),
    })
  }
}
