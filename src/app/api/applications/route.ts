import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseRouteHandlerClient } from '@/lib/supabase-server'

// Writes accept only the fields below, each checked: the request body is
// never spread into the row, so a client cannot set user_id, timestamps or
// any column it was not meant to.

const STATUSES = ['draft', 'applied', 'interview', 'offer', 'rejected', 'ghosted']
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TEXT_FIELDS: [string, number][] = [
  ['company', 200], ['role', 200], ['location', 200], ['salary_range', 100],
  ['notes', 5000], ['cv_version', 200], ['contact_name', 200],
]

type Row = Record<string, unknown>

/** partial: PATCH, where an absent field means "leave it". */
function cleanApplication(body: Row, partial: boolean): { row: Row; error?: string } {
  const row: Row = {}
  const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k)

  for (const [k, max] of TEXT_FIELDS) {
    if (!has(k)) continue
    const v = body[k]
    if (v !== null && typeof v !== 'string') return { row, error: `${k} must be text` }
    const s = typeof v === 'string' ? v.trim() : ''
    if (s.length > max) return { row, error: `${k} must be ${max} characters or fewer` }
    row[k] = s || null
  }
  if (!partial || has('company') || has('role')) {
    if (!partial && (!row.company || !row.role)) return { row, error: 'company and role are required' }
    if (partial && ((has('company') && !row.company) || (has('role') && !row.role))) {
      return { row, error: 'company and role cannot be empty' }
    }
  }
  if (has('status')) {
    if (!STATUSES.includes(String(body.status))) return { row, error: `status must be one of: ${STATUSES.join(', ')}` }
    row.status = body.status
  }
  if (has('applied_date')) {
    const d = body.applied_date
    if (d === null || d === '') row.applied_date = null
    else if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(d))) return { row, error: 'applied_date must be a date (YYYY-MM-DD)' }
    else row.applied_date = d
  }
  if (has('job_url')) {
    const u = body.job_url
    if (u === null || u === '') row.job_url = null
    else {
      try {
        const parsed = new URL(String(u))
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error()
        row.job_url = parsed.toString()
      } catch { return { row, error: 'job_url must be a full http(s) link' } }
    }
  }
  if (has('contact_email')) {
    const e = body.contact_email
    if (e === null || e === '') row.contact_email = null
    else if (typeof e !== 'string' || e.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim())) return { row, error: 'contact_email is not a valid email' }
    else row.contact_email = e.trim()
  }
  if (has('cover_letter_id')) {
    const c = body.cover_letter_id
    if (c === null || c === '') row.cover_letter_id = null
    else if (typeof c !== 'string' || !UUID.test(c)) return { row, error: 'Unknown cover letter' }
    else row.cover_letter_id = c
  }
  return { row }
}

export async function GET(req: NextRequest) {
  try {
    const supabase = createSupabaseRouteHandlerClient(req)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await supabase
      .from('job_applications')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })

    if (error) throw error
    return NextResponse.json({ data: data ?? [] })
  } catch (err) {
    console.error('[applications GET]', err)
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseRouteHandlerClient(req)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const c = cleanApplication(await req.json(), false)
    if (c.error) return NextResponse.json({ error: c.error }, { status: 400 })

    const { data, error } = await supabase
      .from('job_applications')
      .insert({ ...c.row, user_id: user.id })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    console.error('[applications POST]', err)
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = createSupabaseRouteHandlerClient(req)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id, ...fields } = await req.json()
    if (typeof id !== 'string' || !UUID.test(id)) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    const c = cleanApplication(fields, true)
    if (c.error) return NextResponse.json({ error: c.error }, { status: 400 })
    if (!Object.keys(c.row).length) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

    const { data, error } = await supabase
      .from('job_applications')
      .update({ ...c.row, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ data })
  } catch (err) {
    console.error('[applications PATCH]', err)
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = createSupabaseRouteHandlerClient(req)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const id = new URL(req.url).searchParams.get('id')
    if (!id || !UUID.test(id)) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    const { error } = await supabase
      .from('job_applications')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[applications DELETE]', err)
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
  }
}
