import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseRouteHandlerClient } from '@/lib/supabase-server'
import { getAuthUrl, originFromRequest } from '@/lib/google-calendar'

export const runtime = 'nodejs'

// GET — redirect the user to Google's consent screen.
export async function GET(req: NextRequest) {
  const supabase = createSupabaseRouteHandlerClient(req)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/auth', req.url))

  // Random state, verified on callback to prevent CSRF on the OAuth flow.
  const state = crypto.randomUUID()
  // Same origin the browser reached us on, so Google returns to the server
  // that actually started the flow (:39847 in the desktop app, :3000 in dev).
  const res = NextResponse.redirect(getAuthUrl(state, originFromRequest(req)))
  res.cookies.set('google_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })
  return res
}
