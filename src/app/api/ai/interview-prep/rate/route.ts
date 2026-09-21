import { NextRequest, NextResponse } from 'next/server'
import { generate, parseJsonResponse, AI_MODELS, describeAiError } from '@/lib/ai/client'
import { createSupabaseRouteHandlerClient } from '@/lib/supabase-server'

interface Rating {
  score: number
  feedback: string
  model_answer: string
  topic: string
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseRouteHandlerClient(req)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { question, answer, role } = await req.json()
    if (!question || !answer) {
      return NextResponse.json({ error: 'question and answer are required' }, { status: 400 })
    }

    // `topic` is asked for alongside the score because it is what makes the
    // monthly report useful: an average tells you whether you improved, a
    // per-topic breakdown tells you at what. Constrained to a short canonical
    // label so the same subject groups together across months instead of
    // fragmenting into near-duplicate strings.
    const prompt = `You are a senior technical interviewer evaluating a candidate's answer for a "${role || 'software engineering'}" role.

INTERVIEW QUESTION: ${question}

CANDIDATE'S ANSWER:
${answer}

Evaluate the answer and return ONLY valid JSON with no markdown fences:
{
  "score": 7,
  "topic": "React hooks",
  "feedback": "2-3 sentences: what was strong, what was missing or could be improved",
  "model_answer": "A concise, well-structured example answer in 3-5 sentences covering the key points a strong candidate would mention"
}

"topic" must be a short canonical subject label of 1-4 words, chosen so that
answers about the same subject always get the same label. Prefer well-known
names: "React hooks", "SQL indexing", "System design", "Big-O analysis",
"REST API design", "Behavioural". Do not restate the question.

Score guide: 1-3 = incomplete/off-topic, 4-6 = partial understanding, 7-8 = solid with minor gaps, 9-10 = comprehensive and well-articulated.`

    const raw = await generate(prompt, {
      model: AI_MODELS.pro,
      temperature: 0.35,
      maxTokens: 700,
    })

    const parsed = parseJsonResponse<Rating>(raw)

    // Persist before responding so streaks and trends have something to read.
    // Best-effort: a storage failure must not cost the user the feedback they
    // just waited for, but it is reported rather than swallowed.
    let saved = true
    let saveError: string | undefined
    const score = Math.max(0, Math.min(10, Math.round(Number(parsed.score) || 0)))
    const { error } = await supabase.from('practice_attempts').insert({
      user_id: user.id,
      kind: 'interview',
      role: role || null,
      topic: (parsed.topic || '').trim().slice(0, 60) || null,
      question: String(question).slice(0, 500),
      score,
    })
    if (error) {
      saved = false
      saveError = error.code === '42P01'
        ? 'Practice history table is missing — run supabase/migrations/009_practice_attempts.sql.'
        : error.message
      console.error('[ai/interview-prep/rate → save]', error)
    }

    return NextResponse.json({ ...parsed, score, saved, saveError })
  } catch (err) {
    console.error('[ai/interview-prep/rate]', err)
    return NextResponse.json({ error: describeAiError(err) }, { status: 500 })
  }
}
