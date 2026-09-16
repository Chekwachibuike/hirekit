import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseRouteHandlerClient } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  const supabase = createSupabaseRouteHandlerClient(req)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await supabase
    .from('google_calendar_tokens')
    .delete()
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: 'Failed to disconnect' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
