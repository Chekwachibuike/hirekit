import { NextRequest, NextResponse } from 'next/server'
import { generate, parseJsonResponse, AI_MODELS, describeAiError } from '@/lib/ai/client'
import { SYSTEM_PROMPTS } from '@/lib/ai/prompts'
import { createSupabaseRouteHandlerClient } from '@/lib/supabase-server'

export const runtime = 'nodejs'

interface Body {
  role?: string
  job_description?: string
}

export interface ProjectSuggestion {
  title: string
  description: string
  tech_stack: string[]
  gap_closed: string
  target_role_alignment: string
  difficulty: 'beginner' | 'intermediate' | 'advanced'
  estimated_days: number
  portfolio_pitch: string
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseRouteHandlerClient(req)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { role, job_description }: Body = await req.json()
    if (!role?.trim()) {
      return NextResponse.json({ error: 'role is required' }, { status: 400 })
    }

    const [{ data: info }, { data: versions }, { data: existing }] = await Promise.all([
      supabase.from('personal_info').select('summary, skills, experience, cv_markdown')
        .eq('user_id', user.id).single(),
      supabase.from('cv_versions').select('label, cv_markdown')
        .eq('user_id', user.id).order('created_at', { ascending: false }).limit(1),
      supabase.from('projects').select('title, description, tech_stack')
        .eq('user_id', user.id),
    ])

    // The CV is the evidence of what the candidate can already prove. Prefer
    // the live profile copy and fall back to the most recent saved version.
    const cv = (info?.cv_markdown?.trim() || versions?.[0]?.cv_markdown?.trim()) ?? ''

    const skills = Array.isArray(info?.skills) ? info!.skills.join(', ') : ''
    const experience = Array.isArray(info?.experience) && info!.experience.length > 0
      ? info!.experience
          .map((e: { role: string; company: string }) => `${e.role} at ${e.company}`)
          .join('; ')
      : ''

    if (!cv && !skills && !experience) {
      return NextResponse.json(
        { error: 'No CV or profile found. Upload a CV or fill in Personal Info first.' },
        { status: 404 },
      )
    }

    // Named so the model can avoid proposing what already exists, rather than
    // being told vaguely to "suggest something new".
    const built = (existing ?? [])
      .map((p: { title: string; tech_stack?: unknown }) => {
        const stack = Array.isArray(p.tech_stack) ? ` (${p.tech_stack.join(', ')})` : ''
        return `- ${p.title}${stack}`
      })
      .join('\n')

    const sections = [
      `TARGET ROLE: ${role.trim()}`,
      job_description?.trim()
        ? `JOB DESCRIPTION:\n${job_description.trim()}`
        : 'JOB DESCRIPTION: none supplied. Work from the target role title and ordinary market expectations for it, and say so in gap_closed.',
      cv ? `CANDIDATE CV:\n${cv}` : '',
      skills ? `STATED SKILLS: ${skills}` : '',
      experience ? `EXPERIENCE: ${experience}` : '',
      built ? `PROJECTS ALREADY BUILT (do not propose these again):\n${built}` : '',
    ].filter(Boolean)

    const prompt = `${sections.join('\n\n')}

Identify what this role requires that the CV above does not already evidence, then propose 4 projects that close those gaps. Return the JSON array only.`

    const raw = await generate(prompt, {
      model: AI_MODELS.pro,
      systemPrompt: SYSTEM_PROMPTS.projectSuggestion,
      temperature: 0.5,
      maxTokens: 2600,
    })

    const suggestions = parseJsonResponse<ProjectSuggestion[]>(raw)

    return NextResponse.json({
      suggestions,
      // Lets the UI say what the advice was actually based on, instead of
      // leaving the user guessing whether their CV was read at all.
      based_on: {
        cv: !!cv,
        job_description: !!job_description?.trim(),
        existing_projects: (existing ?? []).length,
      },
    })
  } catch (err) {
    console.error('[ai/project-suggestions]', err)
    return NextResponse.json({ error: describeAiError(err) }, { status: 500 })
  }
}
