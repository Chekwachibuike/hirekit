import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseRouteHandlerClient } from '@/lib/supabase-server'
import { loadLinkedIn } from '@/lib/optional-linkedin'
import { parseSearchParams, validateJobId } from '@/lib/job-search-params'
import { runJobSearch } from '@/lib/job-search-run'

export const runtime = 'nodejs'

// GET /api/job-search?q=react&mode=remote|nigeria|relocation&page=1
//                    &location=Lagos &remote=remote|hybrid|onsite &jobage=7
//                    &africaOnly=1   → remote mode: only roles a Nigeria-based applicant can take
//                    &sponsorOnly=1  → relocation mode: only sponsoring employers
//                    &showRisky=1    → include postings the scam check marks suspicious
//                    &sources=linkedin,himalayas,…  (default: the mode's sources)
// GET /api/job-search?id=4012345678  → single LinkedIn job detail
// Every parameter is validated; a bad one is a 400 with a readable message.
export async function GET(req: NextRequest) {
  try {
    const supabase = createSupabaseRouteHandlerClient(req)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const params = new URL(req.url).searchParams

    // Detail lookup — LinkedIn ids only; board listings link out directly.
    const rawId = params.get('id')
    if (rawId !== null) {
      const id = validateJobId(rawId)
      if (!id.ok) return NextResponse.json({ error: id.error }, { status: 400 })
      const li = loadLinkedIn()
      if (!li) {
        return NextResponse.json(
          { error: 'Job details are only available for LinkedIn results, and that source is not installed.' },
          { status: 404 },
        )
      }
      const detail = await li.getJobDetail(id.value)
      if (!detail) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
      return NextResponse.json({ data: detail })
    }

    const parsed = parseSearchParams(params)
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
    const p = parsed.value

    return NextResponse.json(await runJobSearch(p))
  } catch (err) {
    console.error('[job-search GET]', err)
    const msg = err instanceof Error && err.message.includes('rate limit')
      ? err.message
      : 'Search failed'
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
