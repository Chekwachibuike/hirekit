import { NextRequest, NextResponse } from 'next/server'
import { lookup } from 'dns/promises'
import { isIP } from 'net'
import { createSupabaseRouteHandlerClient } from '@/lib/supabase-server'
import { cleanProject } from '@/lib/project-fields'
import { validateSiteUrl, triggerPortfolioRebuild, type FeedProject } from '@/lib/portfolio-publish'

// POST /api/projects/import
//   { site_url, action: 'preview' }          → what the portfolio lists, and
//                                               which of it is already here
//   { site_url, action: 'import', keys: [] } → imports the chosen ones
//
// Reads <site>/hirekit.json — the same shape as HireKit's own public feed,
// so a portfolio that publishes it can be seeded in one step. The file is
// fetched again on import rather than trusting what the browser sends back.

const MAX_BYTES = 1_000_000

/** The URL is user-supplied and fetched by the server, so private and
 *  loopback addresses are refused: otherwise this endpoint could be used to
 *  probe the machine or network HireKit runs on. */
function isPrivate(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase()
    return v === '::1' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80') || v.startsWith('::ffff:127.') || v === '::'
  }
  const [a, b] = ip.split('.').map(Number)
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)
}

async function fetchManifest(origin: string): Promise<FeedProject[]> {
  const host = new URL(origin).hostname
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true })
  if (!addrs.length || addrs.some(a => isPrivate(a.address))) throw new Error('That address is not a public website.')

  const res = await fetch(`${origin}/hirekit.json`, {
    signal: AbortSignal.timeout(10000),
    cache: 'no-store',
    redirect: 'error',
    headers: { Accept: 'application/json' },
  })
  if (res.status === 404) throw new Error(`No hirekit.json found at ${origin}. Add one to the portfolio (see the setup guide), then try again.`)
  if (!res.ok) throw new Error(`${origin}/hirekit.json answered ${res.status}.`)
  const text = await res.text()
  if (text.length > MAX_BYTES) throw new Error('hirekit.json is too large.')

  let json: { projects?: unknown }
  try { json = JSON.parse(text) } catch { throw new Error('hirekit.json is not valid JSON.') }
  if (!Array.isArray(json.projects)) throw new Error('hirekit.json has no "projects" list.')

  return (json.projects as FeedProject[]).slice(0, 200).map(p => ({
    ...p,
    // Portfolios usually reference their own images by path.
    image: p.image ? new URL(p.image, origin).toString() : null,
  }))
}

/** The identity of an imported project: its first link, normalised, so a
 *  second import recognises what is already here. */
function sourceKey(p: FeedProject): string | null {
  const raw = p.live || p.repo || p.docs
  if (!raw) return p.title ? `title:${p.title.trim().toLowerCase()}` : null
  try {
    const u = new URL(raw)
    return `${u.hostname.replace(/^www\./, '').toLowerCase()}${u.pathname.replace(/\/+$/, '').toLowerCase()}`
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  const supabase = createSupabaseRouteHandlerClient(req)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const site = validateSiteUrl(String(body.site_url ?? ''))
  if (!site.ok || !site.value) return NextResponse.json({ error: site.ok ? 'Enter your portfolio address' : site.error }, { status: 400 })

  let items: FeedProject[]
  try {
    items = await fetchManifest(site.value)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not read the portfolio' }, { status: 422 })
  }

  const { data: existingRows } = await supabase.from('projects').select('source_key, title').eq('user_id', user.id)
  const existing = new Set((existingRows ?? []).map(r => r.source_key).filter(Boolean))
  const existingTitles = new Set((existingRows ?? []).map(r => String(r.title).trim().toLowerCase()))

  const candidates = items
    .filter(p => typeof p?.title === 'string' && p.title.trim())
    .map(p => {
      const key = sourceKey(p)
      return { ...p, key, exists: (key !== null && existing.has(key)) || existingTitles.has(p.title.trim().toLowerCase()) }
    })

  // Remember the address for next time and for the connection panel.
  await supabase.from('portfolio_connections').upsert(
    { user_id: user.id, site_url: site.value, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  )

  if (body.action !== 'import') {
    return NextResponse.json({ data: candidates })
  }

  const wanted = new Set(Array.isArray(body.keys) ? body.keys.filter((k: unknown) => typeof k === 'string') : [])
  const chosen = candidates.filter(c => c.key && wanted.has(c.key) && !c.exists)

  // Categories by name, created on first use.
  const { data: cats } = await supabase.from('project_categories').select('id, name').eq('user_id', user.id)
  const catId = new Map((cats ?? []).map(c => [String(c.name).toLowerCase(), c.id as string]))
  let nextSort = cats?.length ?? 0

  const { data: pinnedNow } = await supabase.from('projects').select('pin_order').eq('user_id', user.id).eq('visibility', 'pinned')
  let nextPin = Math.max(-1, ...(pinnedNow ?? []).map(r => (r.pin_order as number | null) ?? -1)) + 1

  const imported: string[] = []
  const failed: { title: string; error: string }[] = []

  for (const c of chosen) {
    let category_id: string | null = null
    const catName = typeof c.category === 'string' ? c.category.replace(/\s+/g, ' ').trim().slice(0, 40) : ''
    if (catName) {
      category_id = catId.get(catName.toLowerCase()) ?? null
      if (!category_id) {
        const { data: made } = await supabase.from('project_categories')
          .insert({ user_id: user.id, name: catName, sort_order: nextSort++ }).select('id').single()
        if (made) { category_id = made.id; catId.set(catName.toLowerCase(), made.id) }
      }
    }

    const cleaned = await cleanProject({
      title: c.title, description: c.description ?? '', blurb: c.blurb, year: c.year,
      tech_stack: Array.isArray(c.stack) ? c.stack.filter(s => typeof s === 'string').slice(0, 30) : [],
      github_url: c.repo, live_url: c.live, docs_url: c.docs, image_url: c.image,
      category_id, visibility: c.pinned ? 'pinned' : 'published',
    }, supabase, user.id, false)
    if (!cleaned.ok) { failed.push({ title: c.title, error: cleaned.error! }); continue }

    const row = { ...cleaned.row, user_id: user.id, source_key: c.key, pin_order: c.pinned ? nextPin++ : null }
    const { error } = await supabase.from('projects').insert(row)
    if (error) failed.push({ title: c.title, error: 'Could not save' })
    else imported.push(c.title)
  }

  if (imported.length) await triggerPortfolioRebuild(supabase, user.id)
  return NextResponse.json({ imported, failed })
}
