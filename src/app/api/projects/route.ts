import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseRouteHandlerClient } from '@/lib/supabase-server'
import { triggerPortfolioRebuild } from '@/lib/portfolio-publish'
import { cleanProject, UUID } from '@/lib/project-fields'

type Row = Record<string, unknown>

// Projects are what a connected portfolio shows, so every write goes through
// cleanProject (src/lib/project-fields.ts): only listed fields are written.

/** Next free slot at the end of the pinned list. */
async function nextPinOrder(supabase: SupabaseClient, userId: string): Promise<number> {
  const { data } = await supabase
    .from('projects').select('pin_order').eq('user_id', userId).eq('visibility', 'pinned')
    .order('pin_order', { ascending: false, nullsFirst: false }).limit(1)
  return ((data?.[0]?.pin_order as number | null) ?? -1) + 1
}

const isVisible = (v: unknown) => v === 'pinned' || v === 'published'

export async function GET(req: NextRequest) {
  try {
    const supabase = createSupabaseRouteHandlerClient(req)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) throw error
    return NextResponse.json({ data: data ?? [] })
  } catch (err) {
    console.error('[projects GET]', err)
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseRouteHandlerClient(req)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const c = await cleanProject(await req.json(), supabase, user.id, false)
    if (!c.ok) return NextResponse.json({ error: c.error }, { status: 400 })
    if (c.row.visibility === 'pinned') c.row.pin_order = await nextPinOrder(supabase, user.id)

    const { data, error } = await supabase
      .from('projects')
      .insert({ ...c.row, user_id: user.id })
      .select()
      .single()

    if (error) throw error
    if (isVisible(data.visibility)) await triggerPortfolioRebuild(supabase, user.id)
    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    console.error('[projects POST]', err)
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
  }
}

// PATCH { id, ...fields }  → update one project
// PATCH { order: [id, …] } → set the pinned order to exactly this sequence
export async function PATCH(req: NextRequest) {
  try {
    const supabase = createSupabaseRouteHandlerClient(req)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json() as Row

    if (Array.isArray(body.order)) {
      const ids = body.order as unknown[]
      if (ids.length > 200 || ids.some(i => typeof i !== 'string' || !UUID.test(i))) {
        return NextResponse.json({ error: 'order must be a list of project ids' }, { status: 400 })
      }
      // Scoped to the owner: ids belonging to someone else match no row.
      await Promise.all((ids as string[]).map((id, i) =>
        supabase.from('projects').update({ pin_order: i }).eq('id', id).eq('user_id', user.id).eq('visibility', 'pinned'),
      ))
      await triggerPortfolioRebuild(supabase, user.id)
      return NextResponse.json({ ok: true })
    }

    const id = body.id
    if (typeof id !== 'string' || !UUID.test(id)) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    const { data: before } = await supabase
      .from('projects').select('visibility').eq('id', id).eq('user_id', user.id).maybeSingle()
    if (!before) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    const c = await cleanProject(body, supabase, user.id, true)
    if (!c.ok) return NextResponse.json({ error: c.error }, { status: 400 })
    if (c.row.visibility === 'pinned' && before.visibility !== 'pinned') c.row.pin_order = await nextPinOrder(supabase, user.id)
    if (c.row.visibility && c.row.visibility !== 'pinned') c.row.pin_order = null

    const { data, error } = await supabase
      .from('projects')
      .update(c.row)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) throw error
    if (isVisible(before.visibility) || isVisible(data.visibility)) await triggerPortfolioRebuild(supabase, user.id)
    return NextResponse.json({ data })
  } catch (err) {
    console.error('[projects PATCH]', err)
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = createSupabaseRouteHandlerClient(req)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const id = new URL(req.url).searchParams.get('id')
    if (!id || !UUID.test(id)) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    const { data: gone, error } = await supabase
      .from('projects')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)
      .select('visibility')

    if (error) throw error
    if (gone?.some(g => isVisible(g.visibility))) await triggerPortfolioRebuild(supabase, user.id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[projects DELETE]', err)
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
  }
}
