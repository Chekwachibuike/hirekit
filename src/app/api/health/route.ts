import { NextRequest, NextResponse } from 'next/server'
import { originFromRequest } from '@/lib/google-calendar'

// Public, unauthenticated identity probe used by the HireKit desktop shell
// (desktop/hirekit.c) to confirm the server on its private port is actually
// THIS app before showing it — instead of blindly rendering whatever happens
// to be listening. The marker string below is what the C shell greps for.
export const dynamic = 'force-dynamic'

export function GET(req: NextRequest) {
  // Also reports the exact redirect_uri the Google OAuth flow will send.
  // redirect_uri_mismatch is otherwise a guessing game: the value depends on
  // the Host header the server happens to see, and Next.js normalises
  // 127.0.0.1 to localhost in some paths but not others. Printing it here
  // makes "what do I register in Google Cloud Console" a fact you can read
  // rather than infer. Safe to expose — the server binds to loopback only,
  // and the redirect URI is public by design (it travels in the auth URL).
  return NextResponse.json(
    {
      app: 'hirekit-desktop',
      ok: true,
      version: 1,
      host: req.headers.get('host'),
      oauthRedirectUri: `${originFromRequest(req)}/api/calendar/google/callback`,
    },
    { headers: { 'Cache-Control': 'no-store', 'X-HireKit': 'hirekit-desktop' } },
  )
}
