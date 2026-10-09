'use client'
import { useEffect } from 'react'
import useSWR, { mutate as globalMutate } from 'swr'
import { Briefcase, FileText, TrendingUp, Trophy, ArrowRight, Plus, Clock, Mail, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { createSupabaseBrowserClient } from '@/lib/supabase'
import { STATUS_CONFIG } from '@/lib/mock'
import type { JobApplication, CalendarEvent } from '@/lib/supabase'
import Card from '@/components/ui/Card'
import StatCard from '@/components/ui/StatCard'
import Badge from '@/components/ui/Badge'

interface Stats { total: number; interviews: number; offers: number; letters: number }

const DASHBOARD_KEY = 'dashboard-data'

interface DashboardData {
  authed: boolean
  stats: Stats
  recent: JobApplication[]
  upcoming: CalendarEvent[]
  name: string
}

const EMPTY_DASHBOARD: DashboardData = {
  authed: false,
  stats: { total: 0, interviews: 0, offers: 0, letters: 0 },
  recent: [],
  upcoming: [],
  name: '',
}

async function fetchDashboard(): Promise<DashboardData> {
  const supabase = createSupabaseBrowserClient()
  const { data: { session } } = await supabase.auth.getSession()
  const user = session?.user
  if (!user) return EMPTY_DASHBOARD

  const [
    { count: total },
    { count: interviews },
    { count: offers },
    { count: letters },
    { data: recentApps },
    { data: events },
    { data: info },
  ] = await Promise.all([
    supabase.from('job_applications').select('*', { count: 'exact', head: true }),
    supabase.from('job_applications').select('*', { count: 'exact', head: true }).eq('status', 'interview'),
    supabase.from('job_applications').select('*', { count: 'exact', head: true }).eq('status', 'offer'),
    supabase.from('cover_letters').select('*', { count: 'exact', head: true }),
    supabase.from('job_applications').select('*').order('updated_at', { ascending: false }).limit(5),
    supabase.from('calendar_events').select('*').gte('date', new Date().toISOString().split('T')[0]).order('date').limit(5),
    supabase.from('personal_info').select('full_name').maybeSingle(),
  ])

  return {
    authed: true,
    stats: {
      total:      total      ?? 0,
      interviews: interviews ?? 0,
      offers:     offers     ?? 0,
      letters:    letters    ?? 0,
    },
    recent:   (recentApps ?? []) as JobApplication[],
    upcoming: (events   ?? []) as CalendarEvent[],
    name:     info?.full_name ? info.full_name.split(' ')[0] : '',
  }
}

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

// ── Skeleton block ──────────────────────────────────────────
function Skeleton({ w = '100%', h = 16, r = 8 }: { w?: string | number; h?: number; r?: number }) {
  return <span className="skeleton" style={{ display: 'block', width: w, height: h, borderRadius: r }} />
}

// ── Event type → color ──────────────────────────────────────
const EVENT_COLORS: Record<string, string> = {
  interview: 'var(--c-gold)',
  deadline:  'var(--c-red)',
  study:     'var(--c-teal)',
  follow_up: 'var(--c-violet)',
  other:     'var(--c-text-muted)',
}

// ── Pipeline snapshot ───────────────────────────────────────
// A single-series magnitude bar (dataviz: one hue for magnitude, direct-labeled,
// rounded data-ends, recessive track). Shows how the pipeline narrows to offers.
function Pipeline({ stats, loading }: { stats: Stats; loading: boolean }) {
  const stages = [
    { key: 'applied',   label: 'Applied',    value: stats.total },
    { key: 'interview', label: 'Interviews', value: stats.interviews },
    { key: 'offer',     label: 'Offers',     value: stats.offers },
  ]
  const max = Math.max(1, ...stages.map(s => s.value))
  const conv = stats.total ? Math.round((stats.offers / stats.total) * 100) : 0

  return (
    <Card pad="20px 22px" style={{ animation: 'fadeUp 0.45s ease 0.18s both' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
        <h2 style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--c-text)' }}>Pipeline</h2>
        <span style={{ fontSize: 11.5, color: 'var(--c-text-muted)' }}>
          {loading ? '' : <><strong style={{ color: 'var(--c-teal)', fontFamily: 'var(--font-mono)' }}>{conv}%</strong> offer rate</>}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
        {stages.map(s => (
          <div key={s.key}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 12.5, color: 'var(--c-text-muted)', fontWeight: 500 }}>{s.label}</span>
              <span style={{ fontSize: 12.5, color: 'var(--c-text)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                {loading ? '·' : s.value}
              </span>
            </div>
            <div style={{ height: 8, borderRadius: 999, background: 'var(--c-bg-4)', overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 999,
                width: loading ? '0%' : `${Math.max(s.value ? 6 : 0, (s.value / max) * 100)}%`,
                background: 'linear-gradient(90deg, var(--c-violet-deep), var(--c-violet))',
                transition: 'width 0.6s cubic-bezier(0.22,1,0.36,1)',
              }} />
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

export default function DashboardPage() {
  const { data, isLoading: loading } = useSWR(DASHBOARD_KEY, fetchDashboard)
  const { authed, stats, recent, upcoming, name } = data ?? EMPTY_DASHBOARD

  useEffect(() => {
    const supabase = createSupabaseBrowserClient()
    const revalidate = () => globalMutate(DASHBOARD_KEY)
    const channel = supabase
      .channel('dashboard-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'job_applications' }, revalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cover_letters' },    revalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_events' },  revalidate)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  const STAT_CARDS = [
    { label: 'Total Applied', value: stats.total,      icon: Briefcase,  color: 'var(--c-violet)' },
    { label: 'Interviews',    value: stats.interviews, icon: TrendingUp, color: 'var(--c-gold-text)'   },
    { label: 'Offers',        value: stats.offers,     icon: Trophy,     color: 'var(--c-teal)'   },
    { label: 'Cover Letters', value: stats.letters,    icon: FileText,   color: 'var(--c-coral-text)'  },
  ]

  return (
    <div style={{ padding: '34px 40px 48px', maxWidth: 1080, margin: '0 auto', animation: 'fadeUp 0.4s ease forwards' }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <p style={{ fontSize: 11.5, color: 'var(--c-violet)', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 9 }}>
          HireKit
          {!loading && authed && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--c-teal)', fontWeight: 600, letterSpacing: '0.08em' }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--c-teal-fill)', display: 'inline-block', animation: 'pulse 2s infinite' }} />
              LIVE
            </span>
          )}
          {loading && <Loader2 size={11} style={{ animation: 'spin 1s linear infinite', color: 'var(--c-text-dim)' }} />}
        </p>

        <h1 style={{ fontSize: 30, fontWeight: 700, color: 'var(--c-text)', letterSpacing: '-0.03em', marginBottom: 7, fontFamily: 'var(--font-display)' }}>
          {loading ? <Skeleton w={280} h={34} /> : <>{greeting()}{name ? `, ${name}` : ''} 👋</>}
        </h1>

        <p style={{ color: 'var(--c-text-muted)', fontSize: 14.5, minHeight: 22 }}>
          {loading ? <Skeleton w={320} h={16} /> : authed
            ? <>You have{' '}
                <strong style={{ color: 'var(--c-teal)' }}>{stats.offers} offer{stats.offers !== 1 ? 's' : ''}</strong>
                {' '}and{' '}
                <strong style={{ color: 'var(--c-gold-text)' }}>{stats.interviews} interview{stats.interviews !== 1 ? 's' : ''}</strong>
                {' '}in progress.
              </>
            : <>Sign in to see your real-time job search data.</>
          }
        </p>
      </div>

      {/* Stats grid */}
      {/* auto-fit: four across on a laptop, two or one when the window is narrow */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14, marginBottom: 20 }}>
        {STAT_CARDS.map((s, i) => (
          <StatCard key={s.label} {...s} loading={loading} delay={i * 0.05} />
        ))}
      </div>

      {/* Main grid */}
      {/* Two columns, stacking below ~1100px (see .dash-split in tokens.css):
          a fixed 320px side column overflowed narrow windows by 180px. */}
      <div className="dash-split">

        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <Pipeline stats={stats} loading={loading} />

          {/* Recent Applications */}
          <Card pad="22px 24px" style={{ animation: 'fadeUp 0.45s ease 0.24s both' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--c-text)' }}>Recent Applications</h2>
              <Link href="/applications" style={{ fontSize: 12.5, color: 'var(--c-violet)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 500 }}>
                View all <ArrowRight size={12} />
              </Link>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {loading ? (
                [0,1,2,3].map(i => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 12px', borderRadius: 'var(--r-md)', background: 'var(--c-surface-2)', border: '1px solid var(--c-border)' }}>
                    <Skeleton w={38} h={38} r={9} />
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <Skeleton w="55%" h={13} />
                      <Skeleton w="35%" h={11} />
                    </div>
                    <Skeleton w={64} h={22} r={999} />
                  </div>
                ))
              ) : recent.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '34px 0', color: 'var(--c-text-dim)' }}>
                  <Briefcase size={30} style={{ opacity: 0.25, marginBottom: 10 }} />
                  <p style={{ fontSize: 13.5, fontWeight: 500 }}>No applications yet</p>
                  <Link href="/applications" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 10, fontSize: 12.5, color: 'var(--c-violet)', textDecoration: 'none', fontWeight: 600 }}>
                    <Plus size={13} /> Add your first
                  </Link>
                </div>
              ) : (
                recent.map((app, i) => {
                  const st = STATUS_CONFIG[app.status]
                  return (
                    <Link
                      key={app.id}
                      href="/applications"
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '11px 12px', borderRadius: 'var(--r-md)',
                        background: 'var(--c-surface-2)', border: '1px solid var(--c-border)',
                        textDecoration: 'none',
                        animation: `fadeUp 0.3s ease ${i * 0.05}s both`,
                        transition: 'border-color 0.15s, background 0.15s',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--c-border-hot)'; e.currentTarget.style.background = 'var(--c-surface-hover)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--c-border)'; e.currentTarget.style.background = 'var(--c-surface-2)' }}
                    >
                      <div style={{ width: 38, height: 38, borderRadius: 9, flexShrink: 0, background: `color-mix(in srgb, ${st.color} 14%, transparent)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: st.color, fontFamily: 'var(--font-mono)' }}>
                        {app.company.slice(0, 2).toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--c-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{app.company}</div>
                        <div style={{ fontSize: 12, color: 'var(--c-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{app.role}</div>
                      </div>
                      <Badge color={st.color} dot>{st.label}</Badge>
                    </Link>
                  )
                })
              )}
            </div>
          </Card>
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* Quick Actions */}
          <Card pad="20px 20px" style={{ animation: 'fadeUp 0.45s ease 0.28s both' }}>
            <h2 style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--c-text)', marginBottom: 14 }}>Quick Actions</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { href: '/cv-builder',    label: 'Build ATS CV',       color: 'var(--c-violet)', icon: FileText  },
                { href: '/applications',  label: 'Add Application',    color: 'var(--c-teal)',   icon: Plus      },
                { href: '/cover-letters', label: 'Write Cover Letter', color: 'var(--c-coral-text)',  icon: Mail      },
                { href: '/calendar',      label: 'Schedule Event',     color: 'var(--c-gold-text)',   icon: Clock     },
              ].map(({ href, label, color, icon: Icon }) => (
                <Link key={href} href={href} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 12px', borderRadius: 'var(--r-md)', background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', textDecoration: 'none', color: 'var(--c-text)', fontSize: 13, fontWeight: 500, transition: 'all 0.15s' }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = `color-mix(in srgb, ${color} 45%, transparent)`; e.currentTarget.style.background = 'var(--c-surface-hover)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--c-border)'; e.currentTarget.style.background = 'var(--c-surface-2)' }}
                >
                  <span style={{ width: 26, height: 26, borderRadius: 7, background: `color-mix(in srgb, ${color} 15%, transparent)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon size={13} color={color} />
                  </span>
                  {label}
                  <ArrowRight size={13} style={{ marginLeft: 'auto', color: 'var(--c-text-dim)' }} />
                </Link>
              ))}
            </div>
          </Card>

          {/* Upcoming */}
          <Card pad="18px 20px" style={{ animation: 'fadeUp 0.45s ease 0.32s both' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <Clock size={14} color="var(--c-text-muted)" />
                <h3 style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--c-text)' }}>Upcoming</h3>
              </div>
              <Link href="/calendar" style={{ fontSize: 11.5, color: 'var(--c-violet)', textDecoration: 'none', fontWeight: 500 }}>View</Link>
            </div>

            {loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[0,1].map(i => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                    <Skeleton w="60%" h={12} />
                    <Skeleton w="20%" h={12} />
                  </div>
                ))}
              </div>
            ) : upcoming.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '14px 0' }}>
                <p style={{ fontSize: 12.5, color: 'var(--c-text-dim)' }}>No upcoming events</p>
                <Link href="/calendar" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 8, fontSize: 11.5, color: 'var(--c-violet)', textDecoration: 'none', fontWeight: 600 }}>
                  <Plus size={12} /> Add event
                </Link>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {upcoming.map((ev, i) => (
                  <div key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: i < upcoming.length - 1 ? '1px solid var(--c-border)' : 'none' }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: EVENT_COLORS[ev.type] ?? 'var(--c-text-dim)', flexShrink: 0 }} />
                    <span style={{ fontSize: 12.5, color: 'var(--c-text)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.title}</span>
                    <span style={{ fontSize: 11.5, color: 'var(--c-text-muted)', fontWeight: 600, flexShrink: 0, fontFamily: 'var(--font-mono)' }}>
                      {new Date(ev.date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      <style>{`
        @keyframes spin  { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
      `}</style>
    </div>
  )
}
