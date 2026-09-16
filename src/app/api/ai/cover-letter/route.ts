import { NextRequest, NextResponse } from 'next/server'
import { generate, AI_MODELS } from '@/lib/ai/client'
import { SYSTEM_PROMPTS } from '@/lib/ai/prompts'
import { createSupabaseRouteHandlerClient } from '@/lib/supabase-server'

interface CoverLetterBody {
  company: string
  role: string
  job_description: string
  tone?: 'formal' | 'confident' | 'casual'
  template?: string   // user-provided template with {placeholder} slots
}

// Extract all {placeholder} tokens from a template string
function extractPlaceholders(template: string): string[] {
  const matches = template.match(/\{[^{}]+\}/g) ?? []
  return Array.from(new Set(matches))
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseRouteHandlerClient(req)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body: CoverLetterBody = await req.json()
    const { company, role, job_description, tone = 'formal', template } = body

    if (!company || !role || !job_description) {
      return NextResponse.json({ error: 'company, role, and job_description are required' }, { status: 400 })
    }

    // Fetch candidate context in parallel
    const [{ data: info }, { data: projects }] = await Promise.all([
      supabase.from('personal_info')
        .select('full_name, email, summary, skills, experience')
        .eq('user_id', user.id).single(),
      supabase.from('projects')
        .select('title, description, tech_stack, github_url, live_url')
        .eq('user_id', user.id).limit(8),
    ])

    const skillsList    = Array.isArray(info?.skills) ? info.skills.join(', ') : ''
    const projectsList  = projects?.length
      ? projects.map(p =>
          `• ${p.title} (${Array.isArray(p.tech_stack) ? p.tech_stack.join(', ') : ''}): ${p.description ?? ''}${p.github_url ? ` — ${p.github_url}` : ''}`
        ).join('\n')
      : 'No projects on record'

    const expSummary = Array.isArray(info?.experience) && info.experience.length > 0
      ? info.experience.map((e: { role: string; company: string; start: string; end: string; bullets?: string[] }) =>
          `${e.role} at ${e.company} (${e.start}–${e.end}): ${(e.bullets ?? []).slice(0, 2).join('; ')}`
        ).join('\n')
      : 'No work experience on record'

    const candidateContext = `
CANDIDATE NAME: ${info?.full_name ?? 'Not set'}
PROFESSIONAL SUMMARY: ${info?.summary ?? 'Not provided'}
SKILLS: ${skillsList || 'Not provided'}
WORK EXPERIENCE:
${expSummary}
PROJECTS:
${projectsList}
`.trim()

    const toneMap = {
      confident: 'Confident and direct — assertive about value, not arrogant.',
      casual:    'Warm and conversational — personable but still professional.',
      formal:    'Polished and formal — precise, structured, no contractions.',
    }

    let prompt: string
    let systemPrompt: string

    if (template && template.trim()) {
      // ── TEMPLATE MODE ──────────────────────────────────────────
      const placeholders = extractPlaceholders(template)
      systemPrompt = SYSTEM_PROMPTS.coverLetterTemplate

      prompt = `COVER LETTER TEMPLATE TO FILL:
---
${template}
---

PLACEHOLDERS TO FILL (${placeholders.length} total):
${placeholders.map(p => `  ${p}`).join('\n')}

TARGET ROLE: ${role}
TARGET COMPANY: ${company}
DESIRED TONE: ${toneMap[tone]}

JOB DESCRIPTION:
${job_description}

CANDIDATE BACKGROUND:
${candidateContext}

INSTRUCTION: Replace every {placeholder} in the template above with real, specific content drawn from the candidate background and job description. Output ONLY the completed letter — the template text with all {} filled. Nothing else.`

    } else {
      // ── FREE-FORM MODE ──────────────────────────────────────────
      systemPrompt = SYSTEM_PROMPTS.coverLetter

      prompt = `Write a cover letter for the opportunity below.

ROLE: ${role}
COMPANY: ${company}
DESIRED TONE: ${toneMap[tone]}

JOB DESCRIPTION:
${job_description}

CANDIDATE BACKGROUND:
${candidateContext}

Write the cover letter body now.`
    }

    const content = await generate(prompt, {
      model: AI_MODELS.pro,
      systemPrompt,
      temperature: template ? 0.55 : 0.75,
      maxTokens: 1200,
    })

    // Save to DB
    const { data: saved, error: dbError } = await supabase.from('cover_letters').insert({
      user_id: user.id,
      title: `${role} at ${company}`,
      company, role, content,
      tone, status: 'draft',
    }).select().single()

    if (dbError) throw dbError
    return NextResponse.json({ cover_letter: saved })

  } catch (err) {
    console.error('[ai/cover-letter]', err)
    return NextResponse.json({ error: 'Generation failed' }, { status: 500 })
  }
}
