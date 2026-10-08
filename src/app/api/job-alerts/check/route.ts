import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseRouteHandlerClient } from '@/lib/supabase-server'
import { checkAlert } from '@/lib/job-alerts'

// POST /api/job-alerts/check — runs the signed-in user's active alerts now.
// The daily cron covers the deployed app; this is for "I want to know
// today", and for the desktop app, which also has LinkedIn to search.
// Matches show in the bell and the alerts panel; no email for a manual run.

export const maxDuration = 60
const BUDGET_MS = 50_000

export async function POST(req: NextRequest) {
  const supabase = createSupabaseRouteHandlerClient(req)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: alerts } = await supabase
    .from('job_alerts').select('id, user_id, name, params')
    .eq('user_id', user.id).eq('active', true)
    .order('last_checked_at', { ascending: true, nullsFirst: true })

  const started = Date.now()
  let found = 0, checked = 0
  for (const a of alerts ?? []) {
    // Searches share a 15-minute source cache, so later alerts are fast;
    // stop before the platform's time limit rather than be cut off mid-write.
    if (Date.now() - started > BUDGET_MS) break
    const r = await checkAlert(supabase, a)
    found += r.newMatches.length
    checked++
  }
  return NextResponse.json({ checked, total: alerts?.length ?? 0, newMatches: found })
}
