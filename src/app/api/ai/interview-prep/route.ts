import { NextRequest, NextResponse } from 'next/server'
import { generate, parseJsonResponse, AI_MODELS } from '@/lib/ai/client'
import { createSupabaseRouteHandlerClient } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseRouteHandlerClient(req)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { role } = await req.json()
    if (!role?.trim()) return NextResponse.json({ error: 'role is required' }, { status: 400 })

    const { data: info } = await supabase
      .from('personal_info')
      .select('skills, experience')
      .eq('user_id', user.id)
      .single()

    const skills = Array.isArray(info?.skills) && info.skills.length > 0
      ? `Candidate skills: ${info.skills.join(', ')}`
      : ''
    const experience = Array.isArray(info?.experience) && info.experience.length > 0
      ? `Experience: ${info.experience.map((e: { role: string; company: string }) => `${e.role} at ${e.company}`).join(', ')}`
      : ''

    const prompt = `You are a senior technical interviewer. Generate interview prep materials for: "${role}".
${skills}
${experience}

Return ONLY valid JSON with no markdown fences, no extra text. Use exactly this shape:
{
  "mcq": [
    { "q": "Question text", "options": ["Option A", "Option B", "Option C", "Option D"], "answer": 0, "explanation": "Why this is correct" }
  ],
  "written": [
    { "q": "Open-ended question", "hint": "What a strong answer should cover" }
  ],
  "leetcode": [
    { "title": "Problem Title", "difficulty": "Easy", "topic": "Arrays", "description": "Full problem statement", "examples": ["Input: nums = [2,7,11,15], target = 9\\nOutput: [0,1]"], "constraints": ["2 <= nums.length <= 10^4"] }
  ]
}

Rules:
- mcq: exactly 15 questions covering system design concepts, coding fundamentals, and role-specific topics for "${role}"
- written: exactly 5 open-ended questions about architecture decisions, trade-offs, past projects, and problem-solving
- leetcode: exactly 3 algorithm/data-structure problems at appropriate difficulty for "${role}"; use authentic LeetCode problem titles where possible
- difficulty must be "Easy", "Medium", or "Hard" (exact strings)`

    const raw = await generate(prompt, {
      model: AI_MODELS.pro,
      temperature: 0.6,
      maxTokens: 4000,
    })

    const parsed = parseJsonResponse<{
      mcq: { q: string; options: string[]; answer: number; explanation: string }[]
      written: { q: string; hint: string }[]
      leetcode: { title: string; difficulty: string; topic: string; description: string; examples: string[]; constraints: string[] }[]
    }>(raw)

    return NextResponse.json(parsed)
  } catch (err) {
    console.error('[ai/interview-prep]', err)
    return NextResponse.json({ error: 'Generation failed' }, { status: 500 })
  }
}
