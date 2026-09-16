import { NextRequest, NextResponse } from 'next/server'
import { generate, parseJsonResponse, AI_MODELS } from '@/lib/ai/client'
import { createSupabaseRouteHandlerClient } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseRouteHandlerClient(req)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { question, answer, role } = await req.json()
    if (!question || !answer) {
      return NextResponse.json({ error: 'question and answer are required' }, { status: 400 })
    }

    const prompt = `You are a senior technical interviewer evaluating a candidate's answer for a "${role || 'software engineering'}" role.

INTERVIEW QUESTION: ${question}

CANDIDATE'S ANSWER:
${answer}

Evaluate the answer and return ONLY valid JSON with no markdown fences:
{
  "score": 7,
  "feedback": "2-3 sentences: what was strong, what was missing or could be improved",
  "model_answer": "A concise, well-structured example answer in 3-5 sentences covering the key points a strong candidate would mention"
}

Score guide: 1-3 = incomplete/off-topic, 4-6 = partial understanding, 7-8 = solid with minor gaps, 9-10 = comprehensive and well-articulated.`

    const raw = await generate(prompt, {
      model: AI_MODELS.pro,
      temperature: 0.35,
      maxTokens: 700,
    })

    const parsed = parseJsonResponse<{ score: number; feedback: string; model_answer: string }>(raw)
    return NextResponse.json(parsed)
  } catch (err) {
    console.error('[ai/interview-prep/rate]', err)
    return NextResponse.json({ error: 'Rating failed' }, { status: 500 })
  }
}
