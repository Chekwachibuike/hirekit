import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseRouteHandlerClient } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
  const supabase = createSupabaseRouteHandlerClient(req)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data } = await supabase
    .from('google_calendar_tokens')
    .select('updated_at')
    .eq('user_id', user.id)
    .maybeSingle()

  return NextResponse.json({ connected: !!data, lastSynced: data?.updated_at ?? null })
}
