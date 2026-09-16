import { NextRequest, NextResponse } from 'next/server'
import { generate, parseJsonResponse, AI_MODELS } from '@/lib/ai/client'
import { createSupabaseRouteHandlerClient } from '@/lib/supabase-server'

// Evaluates how well the user's real profile matches a job posting.
// Modeled on the "job evaluation" stage of drafter-reviewer pipelines:
// evidence-based scoring against the actual profile — no invented skills.
export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseRouteHandlerClient(req)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { title, company, description } = await req.json()
    if (!title || !description) {
      return NextResponse.json({ error: 'title and description are required' }, { status: 400 })
    }

    const [{ data: info }, { data: projects }] = await Promise.all([
      supabase.from('personal_info')
        .select('summary, skills, experience')
        .eq('user_id', user.id).single(),
      supabase.from('projects')
        .select('title, description, tech_stack')
        .eq('user_id', user.id).limit(8),
    ])

    if (!info?.skills?.length && !info?.experience?.length) {
      return NextResponse.json(
        { error: 'Fill in your Personal Info (skills + experience) first so there is something to match against.' },
        { status: 400 }
      )
    }

    const profile = `
SUMMARY: ${info?.summary ?? 'Not provided'}
SKILLS: ${Array.isArray(info?.skills) ? info.skills.join(', ') : 'None'}
EXPERIENCE:
${Array.isArray(info?.experience) && info.experience.length > 0
  ? info.experience.map((e: { role: string; company: string; start: string; end: string; bullets?: string[] }) =>
      `- ${e.role} at ${e.company} (${e.start}–${e.end}): ${(e.bullets ?? []).join('; ')}`
    ).join('\n')
  : 'None'}
PROJECTS:
${projects?.length
  ? projects.map(p => `- ${p.title} (${Array.isArray(p.tech_stack) ? p.tech_stack.join(', ') : ''}): ${p.description ?? ''}`).join('\n')
  : 'None'}
`.trim()

    const prompt = `You are a rigorous, honest recruitment analyst. Compare this candidate's ACTUAL profile against a job posting. Base every claim on evidence from the profile — never invent or assume skills the profile does not show.

JOB POSTING:
Title: ${title}
Company: ${company ?? 'Unknown'}
Description:
${description.slice(0, 6000)}

CANDIDATE PROFILE:
${profile}

Return ONLY valid JSON, no markdown fences:
{
  "score": 72,
  "verdict": "One-sentence honest overall assessment",
  "strengths": ["Specific profile evidence that matches a specific requirement", "..."],
  "gaps": ["Specific requirement the profile does not demonstrate", "..."],
  "advice": ["Concrete action: what to emphasize in the CV/cover letter, or what quick preparation would close a gap", "..."]
}

Rules:
- score: 0-100 integer. Be honest: 80+ only when requirements are clearly met; below 40 when core requirements are missing.
- strengths: 2-5 items, each tying a PROFILE fact to a POSTING requirement.
- gaps: 1-4 items. Missing core requirements — say so plainly.
- advice: 2-4 items, actionable and specific to THIS posting.`

    const raw = await generate(prompt, {
      model: AI_MODELS.pro,
      temperature: 0.3,
      maxTokens: 900,
    })

    const parsed = parseJsonResponse<{
      score: number; verdict: string; strengths: string[]; gaps: string[]; advice: string[]
    }>(raw)

    return NextResponse.json(parsed)
  } catch (err) {
    console.error('[ai/analyze-fit]', err)
    return NextResponse.json({ error: 'Analysis failed' }, { status: 500 })
  }
}
