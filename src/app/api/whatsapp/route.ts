import { NextRequest, NextResponse } from 'next/server'
import {
  initWaClient, disconnectWaClient,
  getWaStatus, getWaMessages,
} from '@/lib/whatsapp-client'
import { createSupabaseRouteHandlerClient } from '@/lib/supabase-server'
import qrcode from 'qrcode'

// GET — return status + QR data URL (if pending)
export async function GET(req: NextRequest) {
  const supabase = createSupabaseRouteHandlerClient(req)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const status = getWaStatus()
  let qrDataUrl: string | null = null

  if (status.qr) {
    try {
      qrDataUrl = await qrcode.toDataURL(status.qr, { width: 256, margin: 2 })
    } catch { /* ignore */ }
  }

  const messages = getWaMessages().slice(0, 20)

  return NextResponse.json({ ...status, qrDataUrl, messages })
}

// POST — connect / disconnect
export async function POST(req: NextRequest) {
  const supabase = createSupabaseRouteHandlerClient(req)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { action } = await req.json()

  if (action === 'connect') {
    await initWaClient()
    return NextResponse.json({ ok: true, message: 'Initializing…' })
  }

  if (action === 'disconnect') {
    await disconnectWaClient()
    return NextResponse.json({ ok: true, message: 'Disconnected' })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
