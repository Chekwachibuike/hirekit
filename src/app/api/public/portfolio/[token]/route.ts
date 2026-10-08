import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { hashToken, TOKEN_PREFIX, type FeedProject, type PortfolioFeed } from '@/lib/portfolio-publish'

// GET /api/public/portfolio/<token>
//
// The read-only feed a portfolio builds from. No login: the token is the
// credential, and it can only ever read one user's PUBLISHED projects.
// Hidden projects, notes and everything else in the account never appear.
//
// Uses the service-role client because the request carries no session; the
// token lookup is the authorisation, and the queries below are scoped to the
// single user that token belongs to.

export const dynamic = 'force-dynamic'

const CORS = {
  // Public, read-only data; lets a portfolio fetch it from the browser too.
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

function notFound() {
  // One answer for malformed, unknown and revoked tokens, so the endpoint
  // does not reveal which tokens ever existed.
  return NextResponse.json({ error: 'Feed not found' }, { status: 404, headers: CORS })
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const token = params.token ?? ''
  if (!token.startsWith(TOKEN_PREFIX) || token.length < 30 || token.length > 80 || !/^[\w-]+$/.test(token)) {
    return notFound()
  }

  try {
    const { data: conn } = await supabaseAdmin
      .from('portfolio_connections')
      .select('user_id')
      .eq('feed_token_hash', hashToken(token))
      .maybeSingle()
    if (!conn) return notFound()

    const [{ data: cats }, { data: rows }] = await Promise.all([
      supabaseAdmin.from('project_categories').select('id, name, sort_order')
        .eq('user_id', conn.user_id).order('sort_order').order('name'),
      supabaseAdmin.from('projects')
        .select('id, title, blurb, description, category_id, tech_stack, live_url, github_url, docs_url, image_url, year, visibility, pin_order, created_at')
        .eq('user_id', conn.user_id)
        .in('visibility', ['pinned', 'published']),
    ])

    const catName = new Map((cats ?? []).map(c => [c.id as string, c.name as string]))
    const sorted = (rows ?? []).sort((a, b) => {
      if (a.visibility !== b.visibility) return a.visibility === 'pinned' ? -1 : 1
      if (a.visibility === 'pinned') return (a.pin_order ?? 1e9) - (b.pin_order ?? 1e9)
      return String(b.created_at).localeCompare(String(a.created_at))
    })

    const projects: FeedProject[] = sorted.map(p => ({
      id: p.id,
      title: p.title,
      blurb: p.blurb ?? null,
      description: p.description || null,
      category: p.category_id ? catName.get(p.category_id) ?? null : null,
      stack: Array.isArray(p.tech_stack) ? p.tech_stack : [],
      live: p.live_url ?? null,
      repo: p.github_url ?? null,
      docs: p.docs_url ?? null,
      image: p.image_url ?? null,
      year: p.year ?? null,
      pinned: p.visibility === 'pinned',
    }))

    // Only categories something is filed under: an empty one would render
    // as an empty filter on the portfolio.
    const used = new Set(projects.map(p => p.category).filter(Boolean))
    const feed: PortfolioFeed = {
      version: 1,
      generatedAt: new Date().toISOString(),
      categories: (cats ?? []).map(c => c.name as string).filter(n => used.has(n)),
      projects,
    }

    return NextResponse.json(feed, {
      headers: {
        ...CORS,
        // Short shared cache: a rebuild a minute after a change sees it.
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=600',
      },
    })
  } catch (err) {
    console.error('[public portfolio feed]', err)
    return NextResponse.json({ error: 'Feed unavailable' }, { status: 500, headers: CORS })
  }
}
