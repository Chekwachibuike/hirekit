import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseRouteHandlerClient } from '@/lib/supabase-server'
import { searchJobs, getJobDetail } from '@/lib/linkedin'
import {
  searchRemoteBoards, filterRelevant, dedupe, classifyEligibility,
  type SourcedJob, type SourceOutcome,
} from '@/lib/job-sources'

export const runtime = 'nodejs'

// GET /api/job-search?q=react&location=Lagos&remote=remote&jobage=7&page=1
//                    &africaOnly=1   → only roles a Nigeria-based applicant can take
//                    &sources=linkedin,remotive,jobicy,remoteok
// GET /api/job-search?id=4012345678  → single job detail (full description)
export async function GET(req: NextRequest) {
  try {
    const supabase = createSupabaseRouteHandlerClient(req)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const params = new URL(req.url).searchParams

    // Detail lookup — LinkedIn ids only; board listings link out directly.
    const id = params.get('id')
    if (id) {
      const detail = await getJobDetail(id)
      if (!detail) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
      return NextResponse.json({ data: detail })
    }

    const query = params.get('q') ?? ''
    if (!query.trim()) {
      return NextResponse.json({ error: 'q (keywords) is required' }, { status: 400 })
    }

    const africaOnly = params.get('africaOnly') === '1'
    const wanted = (params.get('sources') ?? 'linkedin,remotive,jobicy,remoteok')
      .split(',').map(s => s.trim()).filter(Boolean)
    const page = params.get('page') ? Number(params.get('page')) : 1

    const remoteParam = params.get('remote')
    const remote = remoteParam === 'remote' || remoteParam === 'hybrid' || remoteParam === 'onsite'
      ? remoteParam : undefined

    // LinkedIn paginates; the boards return one flat batch, so they are only
    // queried for page 1 and "load more" continues through LinkedIn alone.
    const wantBoards = page === 1 && wanted.some(s => s !== 'linkedin')
    const wantLinkedIn = wanted.includes('linkedin')

    const [liRes, boardRes] = await Promise.allSettled([
      wantLinkedIn
        ? searchJobs({
            query,
            location: params.get('location') ?? undefined,
            jobage: params.get('jobage') ? Number(params.get('jobage')) : undefined,
            remote,
            page,
          })
        : Promise.resolve([]),
      wantBoards ? searchRemoteBoards(query) : Promise.resolve({ jobs: [], outcomes: [] }),
    ])

    const outcomes: SourceOutcome[] = []
    let jobs: SourcedJob[] = []

    if (liRes.status === 'fulfilled') {
      // LinkedIn publishes a job's own location, not who may apply — those are
      // different questions, so eligibility stays 'unknown' unless the location
      // itself is African.
      const li: SourcedJob[] = liRes.value.map(j => {
        const el = classifyEligibility(j.location)
        return {
          ...j,
          source: 'linkedin' as const,
          eligibility: el.level === 'africa-ok' ? 'africa-ok' : 'unknown',
          eligibilityNote: j.location,
          remote: remote === 'remote',
        }
      })
      jobs.push(...li)
      if (wantLinkedIn) outcomes.push({ source: 'linkedin', ok: true, count: li.length })
    } else if (wantLinkedIn) {
      outcomes.push({
        source: 'linkedin', ok: false, count: 0,
        error: liRes.reason instanceof Error ? liRes.reason.message : String(liRes.reason),
      })
    }

    if (boardRes.status === 'fulfilled') {
      const picked = boardRes.value.jobs.filter(j => wanted.includes(j.source))
      jobs.push(...filterRelevant(picked, query))
      outcomes.push(...boardRes.value.outcomes.filter(o => wanted.includes(o.source)))
    }

    jobs = dedupe(jobs)
    const eligibleCount = jobs.filter(j => j.eligibility === 'africa-ok').length
    if (africaOnly) jobs = jobs.filter(j => j.eligibility === 'africa-ok')

    // Newest first, undated last.
    jobs.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))

    return NextResponse.json({ data: jobs, sources: outcomes, eligibleCount })
  } catch (err) {
    console.error('[job-search GET]', err)
    const msg = err instanceof Error && err.message.includes('rate limit')
      ? err.message
      : 'Search failed'
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
