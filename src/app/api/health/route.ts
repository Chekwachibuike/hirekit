import { NextResponse } from 'next/server'

// Public, unauthenticated identity probe used by the HireKit desktop shell
// (desktop/hirekit.c) to confirm the server on its private port is actually
// THIS app before showing it — instead of blindly rendering whatever happens
// to be listening. The marker string below is what the C shell greps for.
export const dynamic = 'force-dynamic'

export function GET() {
  return NextResponse.json(
    { app: 'hirekit-desktop', ok: true, version: 1 },
    { headers: { 'Cache-Control': 'no-store', 'X-HireKit': 'hirekit-desktop' } },
  )
}
