import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseRouteHandlerClient } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
  try {
    const supabase = createSupabaseRouteHandlerClient(req)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await supabase
      .from('skill_assessments')
      .select('levels, updated_at')
      .eq('user_id', user.id)
      .single()

    if (error && error.code !== 'PGRST116') throw error
    return NextResponse.json({ data: data ?? { levels: {}, updated_at: null } })
  } catch (err) {
    console.error('[skill-assessment GET]', err)
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseRouteHandlerClient(req)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { levels } = await req.json()
    if (!levels || typeof levels !== 'object' || Array.isArray(levels)) {
      return NextResponse.json({ error: 'levels object is required' }, { status: 400 })
    }

    // Only keep valid entries: skillId -> integer 1..4 (0/absent = unset)
    const clean: Record<string, number> = {}
    for (const [k, v] of Object.entries(levels)) {
      const n = Number(v)
      if (Number.isInteger(n) && n >= 1 && n <= 4) clean[k] = n
    }

    const { data, error } = await supabase
      .from('skill_assessments')
      .upsert({ user_id: user.id, levels: clean }, { onConflict: 'user_id' })
      .select('levels, updated_at')
      .single()

    if (error) throw error
    return NextResponse.json({ data })
  } catch (err) {
    console.error('[skill-assessment POST]', err)
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
  }
}
