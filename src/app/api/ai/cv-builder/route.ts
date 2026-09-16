import { NextRequest, NextResponse } from 'next/server'
import { generate, AI_MODELS } from '@/lib/ai/client'
import { SYSTEM_PROMPTS } from '@/lib/ai/prompts'
import { createSupabaseRouteHandlerClient } from '@/lib/supabase-server'

interface CvBuilderBody {
  role?: string
  company?: string
  job_description?: string
  save_as_version?: boolean
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseRouteHandlerClient(req)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { role, company, job_description, save_as_version = true }: CvBuilderBody = await req.json()

    // Fetch personal info + all CV versions in parallel
    const [{ data: info }, { data: versions }] = await Promise.all([
      supabase.from('personal_info').select('*').eq('user_id', user.id).single(),
      supabase.from('cv_versions').select('label, cv_markdown').eq('user_id', user.id).order('created_at', { ascending: false }),
    ])

    if (!info && (!versions || versions.length === 0)) {
      return NextResponse.json({ error: 'No CV data found. Upload at least one CV or fill in Personal Info first.' }, { status: 404 })
    }

    // ── Build the source material block ─────────────────────────
    const cvSources: string[] = []

    // Add each uploaded CV version as a named source
    if (versions && versions.length > 0) {
      versions.forEach((v, i) => {
        if (v.cv_markdown?.trim()) {
          cvSources.push(`=== SOURCE CV ${i + 1}: "${v.label}" ===\n${v.cv_markdown.trim()}`)
        }
      })
    }

    // Also synthesize from structured personal_info as an additional source
    if (info) {
      const skillsList = Array.isArray(info.skills) ? info.skills.join(', ') : ''

      const expBlock = Array.isArray(info.experience) && info.experience.length > 0
        ? info.experience.map((e: { role: string; company: string; start: string; end: string; bullets?: string[] }) =>
            `${e.role} at ${e.company} (${e.start} – ${e.end})\n${(e.bullets ?? []).map((b: string) => `- ${b}`).join('\n')}`
          ).join('\n\n')
        : ''

      const eduBlock = Array.isArray(info.education) && info.education.length > 0
        ? info.education.map((e: { degree: string; field: string; institution: string; year: string; grade?: string }) =>
            `${e.degree} in ${e.field}, ${e.institution} (${e.year})${e.grade ? ` — ${e.grade}` : ''}`
          ).join('\n')
        : ''

      const profileSource = [
        `Name: ${info.full_name ?? ''}`,
        info.email    ? `Email: ${info.email}`          : '',
        info.phone    ? `Phone: ${info.phone}`          : '',
        info.location ? `Location: ${info.location}`    : '',
        info.linkedin ? `LinkedIn: ${info.linkedin}`    : '',
        info.github   ? `GitHub: ${info.github}`        : '',
        info.portfolio_url ? `Portfolio: ${info.portfolio_url}` : '',
        info.summary  ? `\nSummary:\n${info.summary}`  : '',
        skillsList    ? `\nSkills:\n${skillsList}`      : '',
        expBlock      ? `\nExperience:\n${expBlock}`    : '',
        eduBlock      ? `\nEducation:\n${eduBlock}`     : '',
      ].filter(Boolean).join('\n')

      cvSources.push(`=== SOURCE: PROFILE DATABASE ===\n${profileSource}`)
    }

    if (cvSources.length === 0) {
      return NextResponse.json({ error: 'No usable CV content found.' }, { status: 404 })
    }

    // ── Build the prompt ──────────────────────────────────────────
    const isRoleTargeted = !!(role && job_description)

    let prompt: string

    if (isRoleTargeted) {
      prompt = `TARGET ROLE: ${role}${company ? ` at ${company}` : ''}

JOB DESCRIPTION:
${job_description}

You have been given ${cvSources.length} source document(s) below. Read ALL of them. Extract the most relevant experience, skills, and achievements for the target role above. Curate a single, optimized, ATS-compliant CV.

${cvSources.join('\n\n')}

Now write the curated CV.`
    } else {
      // Generic — best general CV from all sources
      prompt = `You have been given ${cvSources.length} source CV document(s) below. Synthesize them into a single clean, comprehensive, ATS-compliant CV that best represents this candidate.

${cvSources.join('\n\n')}

Now write the synthesized CV.`
    }

    const cv_markdown = await generate(prompt, {
      model: AI_MODELS.pro,
      systemPrompt: isRoleTargeted ? SYSTEM_PROMPTS.cvCuration : `You are a professional CV writer. Synthesize the provided source CVs into one clean, ATS-compliant Markdown CV. Use the same structural rules as the cvCuration prompt. Output ONLY the Markdown CV.`,
      temperature: 0.2,
      // Headroom for a two-page senior / engineering CV (~900 words + markdown)
      // without truncation; concise one-pagers still stop early on their own.
      maxTokens: 2600,
    })

    // Save as a version
    if (save_as_version) {
      const label = isRoleTargeted
        ? `${role}${company ? ` @ ${company}` : ''} — AI curated`
        : 'AI synthesized CV'

      await supabase.from('cv_versions').insert({ user_id: user.id, label, cv_markdown })
    }

    // Also update the live cv_markdown in personal_info
    if (info) {
      await supabase.from('personal_info').update({ cv_markdown }).eq('user_id', user.id)
    }

    return NextResponse.json({ cv_markdown, sources_used: cvSources.length })

  } catch (err) {
    console.error('[ai/cv-builder]', err)
    return NextResponse.json({ error: 'Generation failed' }, { status: 500 })
  }
}
