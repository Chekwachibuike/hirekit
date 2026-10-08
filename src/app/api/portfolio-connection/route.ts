import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseRouteHandlerClient } from '@/lib/supabase-server'
import {
  newFeedToken, hashToken, feedBaseUrl, validateDeployHook, validateSiteUrl,
  triggerPortfolioRebuild, TOKEN_PREFIX,
} from '@/lib/portfolio-publish'
import type { PortfolioConnection } from '@/lib/supabase'

// The owner's side of the portfolio link.
//   GET                       → status (never the token or the full hook URL)
//   PATCH { site_url?, deploy_hook_url? }
//   POST  { action: 'token' } → makes a new feed token, returned ONCE;
//                               the previous one stops working
//   POST  { action: 'rebuild' } → calls the deploy hook now
//   DELETE                    → revokes the feed token

async function auth(req: NextRequest) {
  const supabase = createSupabaseRouteHandlerClient(req)
  const { data: { user } } = await supabase.auth.getUser()
  return { supabase, user }
}

function hostOf(u: string | null): string | null {
  try { return u ? new URL(u).hostname : null } catch { return null }
}

async function status(supabase: ReturnType<typeof createSupabaseRouteHandlerClient>, userId: string): Promise<PortfolioConnection> {
  const { data } = await supabase
    .from('portfolio_connections')
    .select('site_url, token_hint, token_created_at, deploy_hook_url, last_rebuild_at, last_rebuild_status, feed_token_hash')
    .eq('user_id', userId)
    .maybeSingle()
  return {
    site_url: data?.site_url ?? null,
    token_hint: data?.feed_token_hash ? data.token_hint : null,
    token_created_at: data?.feed_token_hash ? data.token_created_at : null,
    has_deploy_hook: !!data?.deploy_hook_url,
    deploy_hook_host: hostOf(data?.deploy_hook_url ?? null),
    last_rebuild_at: data?.last_rebuild_at ?? null,
    last_rebuild_status: data?.last_rebuild_status ?? null,
    feed_base_url: feedBaseUrl(),
  }
}

export async function GET(req: NextRequest) {
  const { supabase, user } = await auth(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({ data: await status(supabase, user.id) })
}

export async function PATCH(req: NextRequest) {
  const { supabase, user } = await auth(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const row: Record<string, unknown> = { user_id: user.id, updated_at: new Date().toISOString() }

  if (body.site_url !== undefined) {
    const s = validateSiteUrl(String(body.site_url ?? ''))
    if (!s.ok) return NextResponse.json({ error: s.error }, { status: 400 })
    row.site_url = s.value
  }
  if (body.deploy_hook_url !== undefined) {
    const raw = String(body.deploy_hook_url ?? '').trim()
    if (!raw) {
      row.deploy_hook_url = null
    } else {
      const h = validateDeployHook(raw)
      if (!h.ok) return NextResponse.json({ error: h.error }, { status: 400 })
      row.deploy_hook_url = h.value
    }
  }

  const { error } = await supabase.from('portfolio_connections').upsert(row, { onConflict: 'user_id' })
  if (error) return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
  return NextResponse.json({ data: await status(supabase, user.id) })
}

export async function POST(req: NextRequest) {
  const { supabase, user } = await auth(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { action } = await req.json()

  if (action === 'token') {
    const token = newFeedToken()
    const { error } = await supabase.from('portfolio_connections').upsert({
      user_id: user.id,
      feed_token_hash: hashToken(token),
      token_hint: token.slice(-4),
      token_created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
    if (error) return NextResponse.json({ error: 'Failed to create the link' }, { status: 500 })
    return NextResponse.json({ token, feedUrl: feedBaseUrl() + token, data: await status(supabase, user.id) })
  }

  if (action === 'rebuild') {
    const r = await triggerPortfolioRebuild(supabase, user.id, { force: true })
    return NextResponse.json({ ...r, data: await status(supabase, user.id) })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

export async function DELETE(req: NextRequest) {
  const { supabase, user } = await auth(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await supabase.from('portfolio_connections')
    .update({ feed_token_hash: null, token_hint: null, token_created_at: null, updated_at: new Date().toISOString() })
    .eq('user_id', user.id)
  return NextResponse.json({ data: await status(supabase, user.id), revoked: TOKEN_PREFIX })
}
