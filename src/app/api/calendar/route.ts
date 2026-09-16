import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseRouteHandlerClient } from '@/lib/supabase-server'
import {
  getAuthorizedClientForUser, pushEventToGoogle,
  updateEventOnGoogle, deleteEventFromGoogle,
} from '@/lib/google-calendar'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const supabase = createSupabaseRouteHandlerClient(req)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('calendar_events')
    .select('*')
    .eq('user_id', user.id)
    .order('date', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ events: data })
}

export async function POST(req: NextRequest) {
  const supabase = createSupabaseRouteHandlerClient(req)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { title, type, date, time, notes, application_id, timeZone } = body
  if (!title || !type || !date) {
    return NextResponse.json({ error: 'title, type, and date are required' }, { status: 400 })
  }

  const { data, error } = await supabase.from('calendar_events').insert({
    user_id: user.id, title, type, date,
    time: time || null, notes: notes || null,
    application_id: application_id || null,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Best-effort push to Google Calendar — a sync failure shouldn't fail the
  // request, since the event is already safely saved in our own database.
  try {
    const auth = await getAuthorizedClientForUser(supabase, user.id)
    if (auth) {
      const googleEventId = await pushEventToGoogle(auth.client, auth.calendarId, { title, date, time, notes, timeZone })
      if (googleEventId) {
        const { data: updated } = await supabase
          .from('calendar_events')
          .update({ google_event_id: googleEventId })
          .eq('id', data.id)
          .select()
          .single()
        return NextResponse.json({ event: updated ?? data }, { status: 201 })
      }
    }
  } catch (err) {
    console.error('[calendar POST → google sync]', err)
  }

  return NextResponse.json({ event: data }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const supabase = createSupabaseRouteHandlerClient(req)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, timeZone, ...updates } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { data, error } = await supabase.from('calendar_events')
    .update(updates).eq('id', id).eq('user_id', user.id).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  try {
    const auth = await getAuthorizedClientForUser(supabase, user.id)
    if (auth) {
      const eventBody = { title: data.title, date: data.date, time: data.time, notes: data.notes, timeZone }
      if (data.google_event_id) {
        await updateEventOnGoogle(auth.client, auth.calendarId, data.google_event_id, eventBody)
      } else {
        // Created before Google was connected — push it now instead of skipping it.
        const googleEventId = await pushEventToGoogle(auth.client, auth.calendarId, eventBody)
        if (googleEventId) {
          await supabase.from('calendar_events').update({ google_event_id: googleEventId }).eq('id', id)
          data.google_event_id = googleEventId
        }
      }
    }
  } catch (err) {
    console.error('[calendar PATCH → google sync]', err)
  }

  return NextResponse.json({ event: data })
}

export async function DELETE(req: NextRequest) {
  const supabase = createSupabaseRouteHandlerClient(req)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { data: existing } = await supabase
    .from('calendar_events')
    .select('google_event_id')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()

  const { error } = await supabase.from('calendar_events')
    .delete().eq('id', id).eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (existing?.google_event_id) {
    try {
      const auth = await getAuthorizedClientForUser(supabase, user.id)
      if (auth) await deleteEventFromGoogle(auth.client, auth.calendarId, existing.google_event_id)
    } catch (err) {
      console.error('[calendar DELETE → google sync]', err)
    }
  }

  return NextResponse.json({ ok: true })
}
