import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { checkAlert, sendAlertDigest, emailConfigured, type NewMatch } from '@/lib/job-alerts'

// GET /api/cron/job-alerts — the daily run, called by Vercel Cron (see
// vercel.json). Vercel sends "Authorization: Bearer $CRON_SECRET"; without
// CRON_SECRET configured the endpoint refuses to run at all, so it can
// never be triggered by anyone who finds the URL.
//
// Service role, because no user is signed in; every write is scoped to the
// alert's own user_id. Alerts are taken least-recently-checked first, so
// if a run is cut short the next one picks up where it stopped.

export const dynamic = 'force-dynamic'
export const maxDuration = 60
const BUDGET_MS = 50_000

function authorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const got = Buffer.from(req.headers.get('authorization') ?? '')
  const want = Buffer.from(`Bearer ${secret}`)
  return got.length === want.length && timingSafeEqual(got, want)
}

export async function GET(req: NextRequest) {
  if (!authorised(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: alerts, error } = await supabaseAdmin
    .from('job_alerts').select('id, user_id, name, params, email')
    .eq('active', true)
    .order('last_checked_at', { ascending: true, nullsFirst: true })
    .limit(200)
  if (error) return NextResponse.json({ error: 'Could not load alerts' }, { status: 500 })

  const started = Date.now()
  const digests = new Map<string, { name: string; matches: NewMatch[] }[]>()
  let checked = 0, found = 0

  for (const a of alerts ?? []) {
    if (Date.now() - started > BUDGET_MS) break
    const r = await checkAlert(supabaseAdmin, a)
    checked++
    found += r.newMatches.length
    if (r.newMatches.length && a.email) {
      const list = digests.get(a.user_id) ?? []
      list.push({ name: a.name, matches: r.newMatches })
      digests.set(a.user_id, list)
    }
  }

  let emailed = 0
  if (emailConfigured()) {
    for (const [userId, groups] of Array.from(digests.entries())) {
      try {
        const { data } = await supabaseAdmin.auth.admin.getUserById(userId)
        if (data.user?.email) {
          await sendAlertDigest(data.user.email, groups)
          emailed++
        }
      } catch (err) {
        console.error('[cron job-alerts] email failed', err)
      }
    }
  }

  return NextResponse.json({ checked, total: alerts?.length ?? 0, newMatches: found, emailed })
}
