import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseRouteHandlerClient } from '@/lib/supabase-server'
import { parseSearchParams, toQueryString, describeSearch } from '@/lib/job-search-params'
import { checkAlert, MAX_ALERTS_PER_USER, emailConfigured } from '@/lib/job-alerts'

// Saved searches.
//   GET                          → alerts, each with its new-match count and
//                                  latest matches
//   POST  { params }             → save the search (a /api/job-search query
//                                  string); the first run is the baseline
//   PATCH { id, active?, email? } | { seen: alertId | 'all' }
//   DELETE ?id=

export const maxDuration = 60

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function auth(req: NextRequest) {
  const supabase = createSupabaseRouteHandlerClient(req)
  const { data: { user } } = await supabase.auth.getUser()
  return { supabase, user }
}

export async function GET(req: NextRequest) {
  const { supabase, user } = await auth(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [{ data: alerts }, { data: matches }] = await Promise.all([
    supabase.from('job_alerts')
      .select('id, name, params, active, email, last_checked_at, last_error, created_at')
      .eq('user_id', user.id).order('created_at', { ascending: false }),
    supabase.from('job_alert_matches')
      .select('alert_id, job_key, title, company, location, url, source, posted, seen, found_at')
      .eq('user_id', user.id).order('found_at', { ascending: false }).limit(400),
  ])

  const byAlert = new Map<string, typeof matches>()
  for (const m of matches ?? []) {
    const list = byAlert.get(m.alert_id) ?? []
    list.push(m)
    byAlert.set(m.alert_id, list)
  }

  return NextResponse.json({
    emailConfigured: emailConfigured(),
    data: (alerts ?? []).map(a => {
      const list = byAlert.get(a.id) ?? []
      return {
        ...a,
        newCount: list.filter(m => !m.seen).length,
        // New first, then the most recent of what was already open.
        matches: [...list.filter(m => !m.seen), ...list.filter(m => m.seen)].slice(0, 30),
      }
    }),
  })
}

export async function POST(req: NextRequest) {
  const { supabase, user } = await auth(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = parseSearchParams(new URLSearchParams(String(body.params ?? '')))
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const params = toQueryString(parsed.value)
  const { data: existing } = await supabase.from('job_alerts').select('id, params').eq('user_id', user.id)
  if ((existing ?? []).some(a => a.params === params)) {
    return NextResponse.json({ error: 'You already have an alert for this search.' }, { status: 409 })
  }
  if ((existing ?? []).length >= MAX_ALERTS_PER_USER) {
    return NextResponse.json({ error: `You can have up to ${MAX_ALERTS_PER_USER} alerts. Delete one to add another.` }, { status: 400 })
  }

  const { data: alert, error } = await supabase
    .from('job_alerts')
    .insert({ user_id: user.id, name: describeSearch(parsed.value), params })
    .select('id, user_id, name, params')
    .single()
  if (error || !alert) return NextResponse.json({ error: 'Could not save the alert' }, { status: 500 })

  // Record what is open today, so tomorrow's run announces only what is new.
  const first = await checkAlert(supabase, alert, { baseline: true })
  return NextResponse.json({ data: alert, openNow: first.total, error: first.error }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const { supabase, user } = await auth(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()

  if (body.seen !== undefined) {
    let q = supabase.from('job_alert_matches').update({ seen: true }).eq('user_id', user.id).eq('seen', false)
    if (body.seen !== 'all') {
      if (typeof body.seen !== 'string' || !UUID.test(body.seen)) return NextResponse.json({ error: 'Unknown alert' }, { status: 400 })
      q = q.eq('alert_id', body.seen)
    }
    const { error } = await q
    if (error) return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (typeof body.id !== 'string' || !UUID.test(body.id)) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  const update: Record<string, boolean> = {}
  if (typeof body.active === 'boolean') update.active = body.active
  if (typeof body.email === 'boolean') update.email = body.email
  if (!Object.keys(update).length) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

  const { error } = await supabase.from('job_alerts').update(update).eq('id', body.id).eq('user_id', user.id)
  if (error) return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const { supabase, user } = await auth(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const id = new URL(req.url).searchParams.get('id')
  if (!id || !UUID.test(id)) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  const { error } = await supabase.from('job_alerts').delete().eq('id', id).eq('user_id', user.id)
  if (error) return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
