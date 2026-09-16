import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseRouteHandlerClient } from '@/lib/supabase-server'
import { exchangeCodeForTokens } from '@/lib/google-calendar'

export const runtime = 'nodejs'

// GET — Google redirects here after the user approves (or denies) access.
export async function GET(req: NextRequest) {
  const supabase = createSupabaseRouteHandlerClient(req)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/auth', req.url))

  const { searchParams } = new URL(req.url)
  const code  = searchParams.get('code')
  const state = searchParams.get('state')
  const expectedState = req.cookies.get('google_oauth_state')?.value

  const redirectTo = (params: string) => {
    const res = NextResponse.redirect(new URL(`/calendar${params}`, req.url))
    res.cookies.delete('google_oauth_state')
    return res
  }

  if (!code) return redirectTo('?google_error=denied')
  if (!state || state !== expectedState) return redirectTo('?google_error=state_mismatch')

  try {
    const tokens = await exchangeCodeForTokens(code)
    const { error } = await supabase.from('google_calendar_tokens').upsert(
      { user_id: user.id, ...tokens },
      { onConflict: 'user_id' }
    )
    if (error) throw error
    return redirectTo('?google_connected=1')
  } catch (err) {
    console.error('[calendar/google/callback]', err)
    return redirectTo('?google_error=exchange_failed')
  }
}
