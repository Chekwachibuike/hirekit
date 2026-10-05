import { NextResponse } from 'next/server'
import { getCapabilities } from '@/lib/capabilities'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// What this deployment can do. Unauthenticated: it describes the build, not
// the user, and the navigation needs it before anything else loads.
export function GET() {
  return NextResponse.json(getCapabilities(), {
    headers: { 'Cache-Control': 'no-store' },
  })
}
