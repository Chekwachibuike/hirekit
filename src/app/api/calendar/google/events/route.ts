import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseRouteHandlerClient } from '@/lib/supabase-server'
import { getAuthorizedClientForUser, listEventsFromGoogle } from '@/lib/google-calendar'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET ?from=YYYY-MM-DD&to=YYYY-MM-DD — the user's existing Google Calendar
// events for a window. Read-only: this is the direction the sync never had.
// Events created IN HireKit are pushed to Google and would come back here as
// duplicates, so the caller filters them out by google_event_id.
export async function GET(req: NextRequest) {
  const supabase = createSupabaseRouteHandlerClient(req)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')
  const to   = searchParams.get('to')
  if (!from || !to) {
    return NextResponse.json({ error: 'from and to are required (YYYY-MM-DD)' }, { status: 400 })
  }

  const auth = await getAuthorizedClientForUser(supabase, user.id)
  if (!auth) return NextResponse.json({ events: [], connected: false })

  try {
    const events = await listEventsFromGoogle(
      auth.client,
      auth.calendarId,
      new Date(`${from}T00:00:00`).toISOString(),
      new Date(`${to}T23:59:59`).toISOString(),
    )
    return NextResponse.json({ events, connected: true })
  } catch (err) {
    // Surface the failure rather than rendering an empty calendar that looks
    // like "you have nothing on" — that ambiguity is what sent the user
    // hunting for a sync bug the last time this page lied about its state.
    console.error('[calendar/google/events]', err)
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      {
        events: [],
        connected: true,
        error: message.includes('invalid_grant')
          ? 'Google access expired — disconnect and reconnect Google Calendar.'
          : 'Could not read your Google Calendar.',
      },
      { status: 200 },
    )
  }
}
