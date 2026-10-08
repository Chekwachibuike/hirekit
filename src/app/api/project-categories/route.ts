import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseRouteHandlerClient } from '@/lib/supabase-server'
import { triggerPortfolioRebuild } from '@/lib/portfolio-publish'

// User-defined project categories. Deleting one leaves its projects
// uncategorised (the foreign key is ON DELETE SET NULL), never deleted.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function cleanName(v: unknown): string | Error {
  if (typeof v !== 'string') return new Error('Name is required')
  const s = v.replace(/\s+/g, ' ').trim()
  if (!s) return new Error('Name is required')
  if (s.length > 40) return new Error('Name must be 40 characters or fewer')
  return s
}

async function auth(req: NextRequest) {
  const supabase = createSupabaseRouteHandlerClient(req)
  const { data: { user } } = await supabase.auth.getUser()
  return { supabase, user }
}

export async function GET(req: NextRequest) {
  const { supabase, user } = await auth(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data, error } = await supabase
    .from('project_categories').select('id, name, sort_order')
    .eq('user_id', user.id).order('sort_order').order('name')
  if (error) return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}

export async function POST(req: NextRequest) {
  const { supabase, user } = await auth(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const name = cleanName((await req.json()).name)
  if (name instanceof Error) return NextResponse.json({ error: name.message }, { status: 400 })

  const { count } = await supabase.from('project_categories').select('id', { count: 'exact', head: true }).eq('user_id', user.id)
  if ((count ?? 0) >= 30) return NextResponse.json({ error: 'You can have up to 30 categories' }, { status: 400 })

  const { data, error } = await supabase
    .from('project_categories')
    .insert({ user_id: user.id, name, sort_order: count ?? 0 })
    .select('id, name, sort_order').single()
  if (error) {
    const dup = error.code === '23505'
    return NextResponse.json({ error: dup ? `You already have a "${name}" category` : 'Failed to save' }, { status: dup ? 409 : 500 })
  }
  return NextResponse.json({ data }, { status: 201 })
}

// PATCH { id, name }     → rename
// PATCH { order: [id…] } → reorder
export async function PATCH(req: NextRequest) {
  const { supabase, user } = await auth(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()

  if (Array.isArray(body.order)) {
    const ids = body.order as unknown[]
    if (ids.length > 30 || ids.some(i => typeof i !== 'string' || !UUID.test(i))) {
      return NextResponse.json({ error: 'order must be a list of category ids' }, { status: 400 })
    }
    await Promise.all((ids as string[]).map((id, i) =>
      supabase.from('project_categories').update({ sort_order: i }).eq('id', id).eq('user_id', user.id)))
    await triggerPortfolioRebuild(supabase, user.id)
    return NextResponse.json({ ok: true })
  }

  if (typeof body.id !== 'string' || !UUID.test(body.id)) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  const name = cleanName(body.name)
  if (name instanceof Error) return NextResponse.json({ error: name.message }, { status: 400 })

  const { data, error } = await supabase
    .from('project_categories').update({ name })
    .eq('id', body.id).eq('user_id', user.id)
    .select('id, name, sort_order').single()
  if (error) {
    const dup = error.code === '23505'
    return NextResponse.json({ error: dup ? `You already have a "${name}" category` : 'Failed to update' }, { status: dup ? 409 : 500 })
  }
  await triggerPortfolioRebuild(supabase, user.id)
  return NextResponse.json({ data })
}

export async function DELETE(req: NextRequest) {
  const { supabase, user } = await auth(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const id = new URL(req.url).searchParams.get('id')
  if (!id || !UUID.test(id)) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  const { error } = await supabase.from('project_categories').delete().eq('id', id).eq('user_id', user.id)
  if (error) return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
  await triggerPortfolioRebuild(supabase, user.id)
  return NextResponse.json({ ok: true })
}
