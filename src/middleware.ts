import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: { headers: request.headers },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          // Mutate request cookies so the downstream handler sees the refreshed token
          request.cookies.set({ name, value, ...options })
          // Rebuild the response to carry the mutated request headers forward
          const updatedHeaders = new Headers(request.headers)
          updatedHeaders.set(
            'cookie',
            request.cookies.getAll().map(c => `${c.name}=${c.value}`).join('; ')
          )
          response = NextResponse.next({ request: { headers: updatedHeaders } })
          response.cookies.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options })
          const updatedHeaders = new Headers(request.headers)
          updatedHeaders.set(
            'cookie',
            request.cookies.getAll().map(c => `${c.name}=${c.value}`).join('; ')
          )
          response = NextResponse.next({ request: { headers: updatedHeaders } })
          response.cookies.set({ name, value: '', ...options })
        },
      },
    }
  )

  // Refreshes expired sessions — keeps users logged in automatically.
  // getSession() reads the JWT from cookies locally and only hits the network
  // to refresh when the token has actually expired. getUser() would instead
  // make a network round-trip to Supabase's Auth server on every request —
  // and since every API route already calls getUser() itself to authorize the
  // request, doing it here too means paying for two auth round-trips per call.
  await supabase.auth.getSession()

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
