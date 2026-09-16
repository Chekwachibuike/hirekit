import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseRouteHandlerClient } from '@/lib/supabase-server'
import { searchJobs, getJobDetail } from '@/lib/linkedin'

export const runtime = 'nodejs'

// GET /api/job-search?q=react&location=Lagos&remote=remote&jobage=7&page=1
// GET /api/job-search?id=4012345678   → single job detail (full description)
export async function GET(req: NextRequest) {
  try {
    const supabase = createSupabaseRouteHandlerClient(req)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const params = new URL(req.url).searchParams

    // Detail lookup
    const id = params.get('id')
    if (id) {
      const detail = await getJobDetail(id)
      if (!detail) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
      return NextResponse.json({ data: detail })
    }

    // Search
    const query = params.get('q') ?? ''
    if (!query.trim()) {
      return NextResponse.json({ error: 'q (keywords) is required' }, { status: 400 })
    }

    const remoteParam = params.get('remote')
    const results = await searchJobs({
      query,
      location: params.get('location') ?? undefined,
      jobage: params.get('jobage') ? Number(params.get('jobage')) : undefined,
      remote: remoteParam === 'remote' || remoteParam === 'hybrid' || remoteParam === 'onsite'
        ? remoteParam : undefined,
      page: params.get('page') ? Number(params.get('page')) : 1,
    })

    return NextResponse.json({ data: results })
  } catch (err) {
    console.error('[job-search GET]', err)
    const msg = err instanceof Error && err.message.includes('rate limit')
      ? err.message
      : 'Search failed'
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
