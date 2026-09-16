// Google Calendar OAuth + sync helpers. Server-side only — never import
// in a Client Component (uses GOOGLE_CLIENT_SECRET).
import { google } from 'googleapis'
import type { SupabaseClient } from '@supabase/supabase-js'

const SCOPES = ['https://www.googleapis.com/auth/calendar.events']

// The redirect URI is derived from the request that starts the flow, not from
// NEXT_PUBLIC_APP_URL. That env var says localhost:3000, but the desktop build
// serves on 127.0.0.1:39847 — so Google was sending people back to a port
// nothing was listening on, which is why consent never returned and the
// connection never completed.
//
// Google requires the redirect_uri on the token exchange to match the one on
// the auth request byte for byte, so both paths must derive it the same way.
// It also treats "localhost" and "127.0.0.1" as different strings: register
// BOTH of these in Google Cloud Console → Credentials → Authorized redirect URIs:
//   http://127.0.0.1:39847/api/calendar/google/callback   (desktop app)
//   http://localhost:3000/api/calendar/google/callback    (npm run dev)
export function originFromRequest(req: Request): string {
  const host = req.headers.get('host')
  if (!host) return process.env.NEXT_PUBLIC_APP_URL || 'http://127.0.0.1:39847'
  const isLoopback = host.startsWith('localhost') || host.startsWith('127.0.0.1')
  const proto = req.headers.get('x-forwarded-proto') ?? (isLoopback ? 'http' : 'https')
  return `${proto}://${host}`
}

function redirectUri(origin?: string) {
  const base = origin ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://127.0.0.1:39847'
  return `${base}/api/calendar/google/callback`
}

export function getOAuthClient(origin?: string) {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri(origin)
  )
}

// prompt: 'consent' forces Google to re-issue a refresh_token even if the
// user connected before — without it, Google only sends one on first consent.
export function getAuthUrl(state: string, origin?: string) {
  return getOAuthClient(origin).generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    state,
  })
}

export async function exchangeCodeForTokens(code: string, origin?: string) {
  const client = getOAuthClient(origin)
  const { tokens } = await client.getToken(code)
  if (!tokens.refresh_token || !tokens.access_token || !tokens.expiry_date) {
    throw new Error('Google did not return a refresh token — try disconnecting and reconnecting with prompt=consent')
  }
  return {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: tokens.expiry_date,
  }
}

// Loads the user's stored tokens, builds an authorized client, and persists
// any refreshed access token back to the DB so the next call can reuse it.
export async function getAuthorizedClientForUser(supabase: SupabaseClient, userId: string) {
  const { data: row } = await supabase
    .from('google_calendar_tokens')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (!row) return null

  const client = getOAuthClient()
  client.setCredentials({
    access_token: row.access_token,
    refresh_token: row.refresh_token,
    expiry_date: row.expiry_date,
  })

  client.on('tokens', (tokens) => {
    if (!tokens.access_token || !tokens.expiry_date) return
    supabase
      .from('google_calendar_tokens')
      .update({ access_token: tokens.access_token, expiry_date: tokens.expiry_date })
      .eq('user_id', userId)
      .then(() => {}, () => {})
  })

  return { client, calendarId: row.calendar_id as string }
}

interface SyncableEvent {
  title: string
  date: string        // YYYY-MM-DD
  time?: string | null // HH:MM
  notes?: string | null
  timeZone?: string
}

function toGoogleEventBody(event: SyncableEvent) {
  if (event.time) {
    const startDateTime = `${event.date}T${event.time}:00`
    const [h, m] = event.time.split(':').map(Number)
    const endDate = new Date(`${event.date}T${event.time}:00`)
    endDate.setHours(h + 1, m) // default 1-hour duration
    const endDateTime = `${event.date}T${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}:00`
    return {
      summary: event.title,
      description: event.notes || undefined,
      start: { dateTime: startDateTime, timeZone: event.timeZone || 'UTC' },
      end: { dateTime: endDateTime, timeZone: event.timeZone || 'UTC' },
    }
  }
  // All-day event — Google's end.date is exclusive, so it's start + 1 day.
  const end = new Date(`${event.date}T00:00:00`)
  end.setDate(end.getDate() + 1)
  const endDate = end.toISOString().split('T')[0]
  return {
    summary: event.title,
    description: event.notes || undefined,
    start: { date: event.date },
    end: { date: endDate },
  }
}

export async function pushEventToGoogle(
  client: InstanceType<typeof google.auth.OAuth2>,
  calendarId: string,
  event: SyncableEvent
) {
  const calendar = google.calendar({ version: 'v3', auth: client })
  const { data } = await calendar.events.insert({
    calendarId,
    requestBody: toGoogleEventBody(event),
  })
  return data.id ?? null
}

export async function updateEventOnGoogle(
  client: InstanceType<typeof google.auth.OAuth2>,
  calendarId: string,
  googleEventId: string,
  event: SyncableEvent
) {
  const calendar = google.calendar({ version: 'v3', auth: client })
  await calendar.events.update({
    calendarId,
    eventId: googleEventId,
    requestBody: toGoogleEventBody(event),
  })
}

export async function deleteEventFromGoogle(
  client: InstanceType<typeof google.auth.OAuth2>,
  calendarId: string,
  googleEventId: string
) {
  const calendar = google.calendar({ version: 'v3', auth: client })
  try {
    await calendar.events.delete({ calendarId, eventId: googleEventId })
  } catch (err: unknown) {
    // 404/410 means it's already gone on Google's side — not an error for us.
    const status = (err as { code?: number; response?: { status?: number } })?.response?.status ?? (err as { code?: number })?.code
    if (status !== 404 && status !== 410) throw err
  }
}
