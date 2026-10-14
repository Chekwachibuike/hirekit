import { NextRequest, NextResponse } from 'next/server'
import { generateJson, AI_MODELS, describeAiError } from '@/lib/ai/client'
import { createSupabaseRouteHandlerClient } from '@/lib/supabase-server'

// POST { role, company? } → a practice set for any role. An application is
// not required: company is only passed when the user picked one, to aim
// the questions at that employer.

interface Mcq { q: string; options: string[]; answer: number; explanation: string }
interface Written { q: string; hint: string }
interface Leet { title: string; difficulty: string; topic: string; description: string; examples: string[]; constraints: string[] }
interface PrepSet { mcq: Mcq[]; written: Written[]; leetcode: Leet[] }

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const strList = (v: unknown) => (Array.isArray(v) ? v.map(str).filter(Boolean) : [])

/** Keeps only well-formed items: one malformed question should cost that
 *  question, not the whole set. */
function sanitise(raw: Partial<PrepSet>): PrepSet {
  const mcq = (Array.isArray(raw.mcq) ? raw.mcq : [])
    .map(m => ({ q: str(m?.q), options: strList(m?.options), answer: Number(m?.answer), explanation: str(m?.explanation) }))
    .filter(m => m.q && m.options.length === 4 && Number.isInteger(m.answer) && m.answer >= 0 && m.answer < 4)
  const written = (Array.isArray(raw.written) ? raw.written : [])
    .map(w => ({ q: str(w?.q), hint: str(w?.hint) }))
    .filter(w => w.q)
  const leetcode = (Array.isArray(raw.leetcode) ? raw.leetcode : [])
    .map(l => ({
      title: str(l?.title), topic: str(l?.topic), description: str(l?.description),
      difficulty: ['Easy', 'Medium', 'Hard'].includes(str(l?.difficulty)) ? str(l?.difficulty) : 'Medium',
      examples: strList(l?.examples), constraints: strList(l?.constraints),
    }))
    .filter(l => l.title && l.description)
  return { mcq, written, leetcode }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseRouteHandlerClient(req)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const role = str(body.role).slice(0, 150)
    const company = str(body.company).slice(0, 150)
    if (!role) return NextResponse.json({ error: 'Enter the role you are preparing for' }, { status: 400 })

    const { data: info } = await supabase
      .from('personal_info')
      .select('skills, experience')
      .eq('user_id', user.id)
      .maybeSingle()

    const skills = Array.isArray(info?.skills) && info.skills.length > 0
      ? `Candidate skills: ${info.skills.join(', ')}`
      : ''
    const experience = Array.isArray(info?.experience) && info.experience.length > 0
      ? `Experience: ${info.experience.map((e: { role: string; company: string }) => `${e.role} at ${e.company}`).join(', ')}`
      : ''
    const target = company ? `"${role}" at ${company}` : `"${role}"`

    const prompt = `You are a senior interviewer. Generate interview prep materials for ${target}.
${company ? `Where it fits, reflect what ${company} does and the kind of work this role involves there.` : ''}
${skills}
${experience}

Respond with a single JSON object, exactly this shape:
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
- mcq: exactly 15 questions on the fundamentals, tools and judgement this role needs; each has exactly 4 options and "answer" is the 0-based index of the correct one
- written: exactly 5 open-ended questions about decisions, trade-offs, past work and problem-solving in this role
- leetcode: exactly 3 problems. For software roles, algorithm/data-structure problems with authentic LeetCode titles where possible. For roles that are not software (e.g. electrical, mechanical, finance), give 3 role-relevant technical or calculation problems in the same shape instead
- difficulty is exactly "Easy", "Medium" or "Hard"
- Every string must be valid JSON: escape double quotes inside text, and put code or symbols (e.g. @deprecated, <div>) inside the string, never bare`

    const raw = await generateJson<Partial<PrepSet>>(prompt, {
      model: AI_MODELS.pro,
      temperature: 0.6,
      // Reasoning tokens count against this; 4000 cut long sets off mid-JSON.
      maxTokens: 12000,
      reasoningEffort: 'low',
    }, value => {
      const s = sanitise(value)
      return s.mcq.length >= 5 && s.written.length >= 2 ? null : 'The AI returned too few usable questions'
    })

    return NextResponse.json(sanitise(raw))
  } catch (err) {
    console.error('[ai/interview-prep]', err)
    return NextResponse.json({ error: describeAiError(err) }, { status: 500 })
  }
}
