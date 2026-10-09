'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { usePersistentState } from '@/lib/usePersistentState'
import { requestCvTailor, MIN_DESCRIPTION_CHARS } from '@/lib/cv-tailor-handoff'
import JobAlertsPanel, { type JobAlert } from '@/components/JobAlertsPanel'
import { buildTrackedIndex, STATUS_LABELS, type TrackedApplication } from '@/lib/application-match'
import useSWR from 'swr'
import {
  Search, Loader2, MapPin, Building2, Clock, ExternalLink,
  BriefcaseBusiness, Plus, Check, Sparkles, X, ShieldAlert, ShieldCheck, FileText, Bookmark, BellPlus,
} from 'lucide-react'
import { fetcher } from '@/lib/fetcher'
import { validateQuery, validateLocation, QUERY_MAX, LOCATION_MAX } from '@/lib/job-search-params'

// Mirrors JobCard / JobDetail in src/lib/linkedin.ts (client copy — the lib
// itself is server-only so we don't import from it here)
type JobSourceId =
  | 'linkedin' | 'remotive' | 'jobicy' | 'remoteok' | 'arbeitnow'
  | 'himalayas' | 'workingnomads' | 'weworkremotely' | 'hotnigerianjobs' | 'jobzilla' | 'companies'
type SearchMode = 'remote' | 'nigeria' | 'relocation'
type RiskLevel = 'verified' | 'ok' | 'caution' | 'suspicious'
type Eligibility = 'africa-ok' | 'restricted' | 'unknown'

interface JobCard {
  id: string
  title: string
  company: string | null
  companyUrl: string | null
  location: string | null
  date: string | null
  url: string
  source?: JobSourceId
  /** Posting body, where the board returned one. */
  description?: string | null
  /** Whether a Nigeria-based applicant may apply, per the board's own wording. */
  eligibility?: Eligibility
  eligibilityNote?: string | null
  /** What the posting says about sponsoring a work visa. */
  visa?: 'offers' | 'denies' | 'unstated'
  /** Company holds a UK Skilled Worker sponsor licence. */
  ukSponsor?: boolean
  ukSponsorMatchedAs?: string | null
  /** Scam check: level plus the red flags behind it. */
  risk?: { level: RiskLevel; reasons: string[] }
}

interface SourceOutcome {
  source: JobSourceId
  ok: boolean
  count: number
  error?: string
}

const SOURCE_LABELS: Record<JobSourceId, string> = {
  linkedin: 'LinkedIn',
  remotive: 'Remotive',
  jobicy: 'Jobicy',
  remoteok: 'RemoteOK',
  arbeitnow: 'Arbeitnow',
  himalayas: 'Himalayas',
  workingnomads: 'Working Nomads',
  weworkremotely: 'We Work Remotely',
  hotnigerianjobs: 'HotNigerianJobs',
  jobzilla: 'Jobzilla',
  companies: 'Company boards',
}

const MODE_LABELS: Record<SearchMode, { label: string; hint: string }> = {
  remote:     { label: 'Remote', hint: 'Remote roles you can do from Nigeria, from global boards and remote-first employers' },
  nigeria:    { label: 'In Nigeria', hint: 'Jobs based in Nigeria: Nigerian job boards and tech companies, plus remote roles open to Nigeria' },
  relocation: { label: 'Relocation', hint: 'On-site roles abroad, checked against the UK sponsor register' },
}

const RISK_BADGE: Record<Exclude<RiskLevel, 'ok'>, { label: string; color: string; bg: string }> = {
  verified:   { label: 'Verified employer', color: 'var(--c-teal)', bg: 'rgba(0,168,133,0.1)' },
  caution:    { label: 'Check carefully', color: 'var(--c-amber)', bg: 'color-mix(in srgb, var(--c-amber) 13%, transparent)' },
  suspicious: { label: 'Possible scam', color: 'var(--c-red)', bg: 'var(--c-red-dim)' },
}

function RiskBadge({ risk }: { risk?: JobCard['risk'] }) {
  if (!risk || risk.level === 'ok') return null
  const b = RISK_BADGE[risk.level]
  const tip = risk.level === 'verified'
    ? "Read straight from the employer's own hiring system, or a licensed UK sponsor"
    : `Red flags: ${risk.reasons.join('; ')}`
  return (
    <span title={tip} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 9px', borderRadius: 999, background: b.bg, color: b.color, fontWeight: 600, fontSize: 10 }}>
      {risk.level === 'verified' ? <ShieldCheck size={10} /> : <ShieldAlert size={10} />} {b.label}
    </span>
  )
}
interface JobDetail extends JobCard {
  description: string | null
  seniority: string | null
  employmentType: string | null
  jobFunction: string | null
  industries: string | null
  applyUrl: string | null
}

type Remote = '' | 'remote' | 'hybrid' | 'onsite'

interface FitAnalysis {
  score: number
  verdict: string
  strengths: string[]
  gaps: string[]
  advice: string[]
}

const JOBAGE_OPTIONS = [
  { value: 0,  label: 'Any time' },
  { value: 1,  label: 'Past 24 hours' },
  { value: 7,  label: 'Past week' },
  { value: 30, label: 'Past month' },
]

function timeAgo(dateStr: string | null): string | null {
  if (!dateStr) return null
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return `${Math.floor(days / 30)}mo ago`
}

// Count how many of the user's skills appear in the given text
function matchedSkills(text: string, skills: string[]): string[] {
  const lower = text.toLowerCase()
  return skills.filter(s => lower.includes(s.toLowerCase()))
}

export default function JobSearchPage() {
  // User's skills — powers the match score, same source as the WhatsApp filter
  const { data: infoData } = useSWR<{ data: { skills?: string[] } | null }>('/api/personal-info', fetcher)
  const skills: string[] = Array.isArray(infoData?.data?.skills) ? infoData!.data!.skills! : []

  // Search form. Everything here is kept across page changes (see
  // usePersistentState); only in-flight flags are memory-only.
  const [query, setQuery]       = usePersistentState('jobSearch.query', '')
  const [location, setLocation] = usePersistentState('jobSearch.location', '')
  const [remote, setRemote]     = usePersistentState<Remote>('jobSearch.remote', '')
  const [jobage, setJobage]     = usePersistentState('jobSearch.jobage', 7)
  const [africaOnly, setAfricaOnly] = usePersistentState('jobSearch.africaOnly', true)
  const [mode, setMode] = usePersistentState<SearchMode>('jobSearch.mode', 'remote')
  const [sponsorOnly, setSponsorOnly] = usePersistentState('jobSearch.sponsorOnly', false)
  const [sponsorCount, setSponsorCount] = usePersistentState('jobSearch.sponsorCount', 0)
  const [sponsorAsOf, setSponsorAsOf] = usePersistentState<string | null>('jobSearch.sponsorAsOf', null)
  const [showRisky, setShowRisky] = usePersistentState('jobSearch.showRisky', false)
  const [suspiciousCount, setSuspiciousCount] = usePersistentState('jobSearch.suspiciousCount', 0)
  const [sourceOutcomes, setSourceOutcomes] = usePersistentState<SourceOutcome[]>('jobSearch.sourceOutcomes', [])
  const [eligibleCount, setEligibleCount]   = usePersistentState('jobSearch.eligibleCount', 0)

  // Results
  const [results, setResults]   = usePersistentState<JobCard[]>('jobSearch.results', [])
  const [page, setPage]         = usePersistentState('jobSearch.page', 1)
  const [searching, setSearching] = usePersistentState('jobSearch.searching', false, { session: false })
  const [loadingMore, setLoadingMore] = usePersistentState('jobSearch.loadingMore', false, { session: false })
  const [searched, setSearched] = usePersistentState('jobSearch.searched', false)
  const [error, setError]       = usePersistentState<string | null>('jobSearch.error', null)

  // Detail panel
  const [detail, setDetail]         = usePersistentState<JobDetail | null>('jobSearch.detail', null)
  const [detailLoading, setDetailLoading] = usePersistentState<string | null>('jobSearch.detailLoading', null, { session: false })

  // What is already on the Applications board, read from the database — so
  // a job tracked last week, added by hand, or found again on another board
  // shows as tracked. Same SWR key as the Applications page, so a status
  // changed there shows here without a refetch.
  const { data: appsData, mutate: mutateApps } = useSWR<{ data: TrackedApplication[] }>('/api/applications', fetcher)
  const tracked = useMemo(() => buildTrackedIndex(appsData?.data ?? []), [appsData])
  const [adding, setAdding] = usePersistentState<string | null>('jobSearch.adding', null, { session: false })

  // AI fit analysis — cached per job id so re-opening a job doesn't re-pay the AI call
  const [fitCache, setFitCache]   = usePersistentState<Record<string, FitAnalysis>>('jobSearch.fitCache', {})
  const [analyzing, setAnalyzing] = usePersistentState('jobSearch.analyzing', false, { session: false })
  const [fitError, setFitError]   = usePersistentState<string | null>('jobSearch.fitError', null)

  // Tailor CV: id of the job whose description is being fetched first
  const [tailoring, setTailoring] = usePersistentState<string | null>('jobSearch.tailoring', null, { session: false })

  // Job alerts: saved searches checked daily (see /api/cron/job-alerts)
  const { data: alertData, mutate: mutateAlerts } =
    useSWR<{ data: JobAlert[]; emailConfigured: boolean }>('/api/job-alerts', fetcher)
  const alerts = alertData?.data ?? []
  const newAlertCount = alerts.reduce((n, a) => n + a.newCount, 0)
  const [alertsOpen, setAlertsOpen] = useState(false)
  const [savingAlert, setSavingAlert] = useState(false)
  const [alertNote, setAlertNote] = useState<string | null>(null)
  const [runPending, setRunPending] = useState(false)

  // The bell links here with ?alerts=1. window.location rather than
  // useSearchParams keeps the page statically prerendered.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('alerts') === '1') {
      setAlertsOpen(true)
      window.history.replaceState({}, '', '/job-search')
    }
  }, [])
  const router = useRouter()
  // Warm the CV builder so the hand-off is a page swap, not a cold load.
  useEffect(() => { router.prefetch('/cv-builder') }, [router])

  // Same rules the API enforces, checked before sending so a typo is
  // explained here instead of costing a round trip.
  const queryCheck = validateQuery(query)
  const locationCheck = validateLocation(location)
  const formError = query.trim() && !queryCheck.ok ? queryCheck.error
    : !locationCheck.ok ? locationCheck.error
    : null
  const canSearch = queryCheck.ok && locationCheck.ok && !searching

  // Remote mode is remote work by definition, and relocation means moving,
  // so each mode only offers the workplace options that make sense in it.
  function changeMode(m: SearchMode) {
    setMode(m)
    if (m === 'remote') setRemote('')
    if (m === 'relocation' && remote === 'remote') setRemote('')
  }

  function buildParams(p: number) {
    const params = new URLSearchParams({ q: queryCheck.value ?? '', page: String(p) })
    if (locationCheck.value) params.set('location', locationCheck.value)
    if (remote && mode !== 'remote') params.set('remote', remote)
    if (jobage > 0) params.set('jobage', String(jobage))
    if (africaOnly && mode === 'remote') params.set('africaOnly', '1')
    params.set('mode', mode)
    if (sponsorOnly && mode === 'relocation') params.set('sponsorOnly', '1')
    if (showRisky) params.set('showRisky', '1')
    return params
  }

  async function search() {
    if (!canSearch) {
      if (formError) setError(formError)
      return
    }
    setSearching(true)
    setError(null)
    setDetail(null)
    setPage(1)
    try {
      const res  = await fetch(`/api/job-search?${buildParams(1)}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Search failed')
      setResults(json.data)
      setSourceOutcomes(json.sources ?? [])
      setEligibleCount(json.eligibleCount ?? 0)
      setSponsorCount(json.sponsorCount ?? 0)
      setSponsorAsOf(json.sponsorAsOf ?? null)
      setSuspiciousCount(json.suspiciousCount ?? 0)
      setSearched(true)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Search failed')
    } finally {
      setSearching(false)
    }
  }

  async function saveAlert() {
    if (!canSearch || savingAlert) return
    setSavingAlert(true); setAlertNote(null); setError(null)
    try {
      const res = await fetch('/api/job-alerts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ params: buildParams(1).toString() }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Could not save the alert')
      setAlertNote(`Search saved. ${json.openNow ? `${json.openNow} matching job${json.openNow === 1 ? ' is' : 's are'} open now; ` : ''}new ones will appear in the bell each morning.`)
      mutateAlerts()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the alert')
    } finally {
      setSavingAlert(false)
    }
  }

  // "Run this search" from an alert: load its settings, then search once
  // the state has applied.
  function runAlert(params: string) {
    const q = new URLSearchParams(params)
    setQuery(q.get('q') ?? '')
    setLocation(q.get('location') ?? '')
    const m = q.get('mode')
    setMode(m === 'nigeria' || m === 'relocation' ? m : 'remote')
    const w = q.get('remote')
    setRemote(w === 'remote' || w === 'hybrid' || w === 'onsite' ? w : '')
    setJobage(Number(q.get('jobage') ?? 0) || 0)
    setAfricaOnly(q.get('africaOnly') === '1')
    setSponsorOnly(q.get('sponsorOnly') === '1')
    setRunPending(true)
  }
  useEffect(() => {
    if (runPending && canSearch) { setRunPending(false); search() }
    // search reads the state set by runAlert; it must run after that render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runPending, canSearch])

  async function loadMore() {
    const next = page + 1
    setLoadingMore(true)
    try {
      const res  = await fetch(`/api/job-search?${buildParams(next)}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed')
      setResults(r => {
        const seen = new Set(r.map(j => j.id))
        return [...r, ...json.data.filter((j: JobCard) => !seen.has(j.id))]
      })
      setPage(next)
    } catch { /* keep existing results */ }
    finally { setLoadingMore(false) }
  }

  async function openDetail(job: JobCard) {
    // Only LinkedIn has a detail endpoint; board results already carry
    // their description, so they open straight from what was loaded.
    if (job.source && job.source !== 'linkedin') {
      setDetail({ ...job, description: job.description ?? null, seniority: null, employmentType: null, jobFunction: null, industries: null, applyUrl: null })
      return
    }
    setDetailLoading(job.id)
    try {
      const res  = await fetch(`/api/job-search?id=${encodeURIComponent(job.id)}`)
      const json = await res.json()
      // Keep the card's own fields (risk, eligibility, date) under the detail.
      if (res.ok) setDetail({ ...job, ...json.data, date: json.data.date ?? job.date, source: job.source })
      else setDetail({ ...job, description: job.description ?? null, seniority: null, employmentType: null, jobFunction: null, industries: null, applyUrl: null })
    } catch {
      setDetail({ ...job, description: job.description ?? null, seniority: null, employmentType: null, jobFunction: null, industries: null, applyUrl: null })
    } finally {
      setDetailLoading(null)
    }
  }

  // Hands the job to the CV builder, which curates on arrival — the same
  // request as its own "Generate for Role", without retyping anything.
  async function tailorCv(job: JobCard | JobDetail) {
    if (tailoring) return
    let description = job.description ?? null
    // LinkedIn cards carry no description; the detail endpoint has it.
    if ((description?.length ?? 0) < MIN_DESCRIPTION_CHARS && (!job.source || job.source === 'linkedin')) {
      setTailoring(job.id)
      try {
        const res = await fetch(`/api/job-search?id=${encodeURIComponent(job.id)}`)
        if (res.ok) description = (await res.json()).data?.description ?? description
      } catch { /* fall through: the CV builder asks for the description */ }
      finally { setTailoring(null) }
    }
    requestCvTailor({
      role: job.title,
      company: job.company ?? '',
      job_description: description ?? '',
      jobUrl: job.url,
      source: job.source ? SOURCE_LABELS[job.source] : undefined,
    })
    router.push('/cv-builder')
  }

  async function addToApplications(job: JobCard | JobDetail) {
    // Never a second copy: the board may already have it from elsewhere.
    if (tracked.find(job)) return
    setAdding(job.id)
    try {
      const res = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company: job.company ?? 'Unknown',
          role: job.title,
          location: job.location ?? '',
          status: 'draft',
          applied_date: new Date().toISOString().slice(0, 10),
          job_url: job.url,
          notes: `Found via HireKit Job Search on ${job.source ? SOURCE_LABELS[job.source] : 'LinkedIn'}`,
        }),
      })
      if (res.ok) {
        const json = await res.json()
        mutateApps(cur => ({ data: [json.data, ...(cur?.data ?? [])] }), { revalidate: false })
      }
    } finally {
      setAdding(null)
    }
  }

  async function analyzeFit() {
    if (!detail?.description || analyzing) return
    setAnalyzing(true)
    setFitError(null)
    try {
      const res  = await fetch('/api/ai/analyze-fit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: detail.title, company: detail.company, description: detail.description }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Analysis failed')
      setFitCache(c => ({ ...c, [detail.id]: json }))
    } catch (e: unknown) {
      setFitError(e instanceof Error ? e.message : 'Analysis failed')
    } finally {
      setAnalyzing(false)
    }
  }

  const detailMatches = detail
    ? matchedSkills(`${detail.title} ${detail.description ?? ''}`, skills)
    : []
  const fit = detail ? fitCache[detail.id] : undefined
  const detailOnBoard = detail ? tracked.find(detail) : undefined

  return (
    <div style={{ height: 'calc(100vh - var(--topbar-h))', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ padding: '22px 32px 16px', borderBottom: '1px solid var(--c-border)', flexShrink: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--c-text)', letterSpacing: '-0.02em', marginBottom: 3 }}>Job Search</h1>
          <p style={{ fontSize: 12, color: 'var(--c-text-muted)' }}>LinkedIn, remote and Nigerian job boards, and the hiring pages of tech, energy and engineering employers — filtered for who can apply, checked for scams</p>
        </div>
        {/* Managing saved searches lives here; their news goes to the bell,
            the one place for everything new. */}
        <button onClick={() => setAlertsOpen(o => !o)} aria-expanded={alertsOpen}
          title="Searches saved with Alert me. New matches also appear in the bell."
          style={{
            display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 'var(--r-md)', flexShrink: 0,
            background: alertsOpen ? 'var(--c-violet-dim)' : 'var(--c-bg-2)', border: '1px solid var(--c-border-md)',
            color: alertsOpen ? 'var(--c-violet)' : 'var(--c-text)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)',
          }}>
          <Bookmark size={14} /> Saved searches
          {newAlertCount > 0 && (
            <span aria-label={`${newAlertCount} new`} style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 999, background: 'var(--c-violet-fill)', color: '#fff' }}>{newAlertCount}</span>
          )}
        </button>
      </div>

      {alertsOpen && (
        <JobAlertsPanel
          alerts={alerts}
          emailConfigured={!!alertData?.emailConfigured}
          sourceLabel={s => (s && s in SOURCE_LABELS ? SOURCE_LABELS[s as JobSourceId] : s)}
          trackedStatus={m => { const a = tracked.find({ url: m.url, company: m.company, title: m.title }); return a ? STATUS_LABELS[a.status] : null }}
          onChanged={() => mutateAlerts()}
          onRemove={id => mutateAlerts(cur => cur ? { ...cur, data: cur.data.filter(a => a.id !== id) } : cur, { revalidate: false })}
          onRun={params => { setAlertsOpen(false); runAlert(params) }}
          onClose={() => setAlertsOpen(false)}
        />
      )}

      {/* Search bar */}
      <div style={{ padding: '14px 32px', borderBottom: '1px solid var(--c-border)', flexShrink: 0, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--c-bg-2)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', padding: '0 12px', flex: 2, minWidth: 200 }}>
          <Search size={14} color="var(--c-text-muted)" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            maxLength={QUERY_MAX}
            onKeyDown={e => e.key === 'Enter' && search()}
            placeholder="Keywords — e.g. React developer, electrical engineer, graduate trainee, oil and gas…"
            aria-label="Search keywords"
            style={{ flex: 1, padding: '9px 0', background: 'none', border: 'none', outline: 'none', color: 'var(--c-text)', fontSize: 13, fontFamily: 'var(--font-body)' }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--c-bg-2)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', padding: '0 12px', flex: 1, minWidth: 140 }}>
          <MapPin size={14} color="var(--c-text-muted)" />
          <input
            value={location}
            onChange={e => setLocation(e.target.value)}
            maxLength={LOCATION_MAX}
            onKeyDown={e => e.key === 'Enter' && search()}
            placeholder={mode === 'nigeria' ? 'City, e.g. Lagos (optional)' : 'Location (optional)'}
            aria-label="Location"
            style={{ flex: 1, padding: '9px 0', background: 'none', border: 'none', outline: 'none', color: 'var(--c-text)', fontSize: 13, fontFamily: 'var(--font-body)' }}
          />
        </div>
        {mode !== 'remote' && <select value={remote} onChange={e => setRemote(e.target.value as Remote)} aria-label="Workplace type"
          style={{ padding: '9px 12px', background: 'var(--c-bg-2)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', color: remote ? 'var(--c-text)' : 'var(--c-text-muted)', fontSize: 12, outline: 'none', fontFamily: 'var(--font-body)', cursor: 'pointer' }}>
          <option value="">Any workplace</option>
          {mode === 'nigeria' && <option value="remote">Remote</option>}
          <option value="hybrid">Hybrid</option>
          <option value="onsite">On-site</option>
        </select>}
        <select value={jobage} onChange={e => setJobage(Number(e.target.value))} aria-label="Posted within"
          style={{ padding: '9px 12px', background: 'var(--c-bg-2)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', color: 'var(--c-text)', fontSize: 12, outline: 'none', fontFamily: 'var(--font-body)', cursor: 'pointer' }}>
          {JOBAGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <button onClick={search} disabled={!canSearch}
          style={{
            display: 'flex', alignItems: 'center', gap: 7, padding: '9px 22px',
            borderRadius: 'var(--r-md)',
            background: !canSearch ? 'var(--c-bg-4)' : 'var(--c-coral-fill)',
            border: 'none', color: !canSearch ? 'var(--c-text-dim)' : '#fff', fontSize: 13, fontWeight: 600,
            cursor: !canSearch ? 'default' : 'pointer',
            fontFamily: 'var(--font-body)',
          }}>
          {searching ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Search size={14} />}
          Search
        </button>
        <button onClick={saveAlert} disabled={!canSearch || savingAlert}
          title="Save this search. Each morning, new matching jobs appear in the bell (top right)"
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 'var(--r-md)',
            background: 'var(--c-bg-2)', border: '1px solid var(--c-border-md)',
            color: !canSearch ? 'var(--c-text-dim)' : 'var(--c-text)', fontSize: 13, fontWeight: 600,
            cursor: !canSearch ? 'default' : 'pointer', fontFamily: 'var(--font-body)',
          }}>
          {savingAlert ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <BellPlus size={14} />}
          Alert me
        </button>

        {/* Row break: the mode and its toggles sit together on the second
            line, instead of wrapping one stray checkbox at a time. */}
        <div aria-hidden style={{ flexBasis: '100%', height: 0 }} />

        {/* Remote vs relocation are different searches: different sources, and
            sponsorship only means anything when moving country. */}
        <div style={{ display: 'flex', gap: 2, padding: 2, borderRadius: 999, background: 'var(--c-bg-2)', border: '1px solid var(--c-border)' }}>
          {(['remote', 'nigeria', 'relocation'] as SearchMode[]).map(m => (
            <button
              key={m}
              onClick={() => changeMode(m)}
              title={MODE_LABELS[m].hint}
              style={{
                padding: '6px 14px', borderRadius: 999, border: 'none', cursor: 'pointer',
                fontFamily: 'var(--font-body)', fontSize: 12,
                fontWeight: mode === m ? 700 : 500,
                background: mode === m ? 'var(--c-violet-dim)' : 'transparent',
                color: mode === m ? 'var(--c-violet)' : 'var(--c-text-muted)',
                transition: 'all 0.15s',
              }}
            >
              {MODE_LABELS[m].label}
            </button>
          ))}
        </div>

        {mode === 'relocation' && (
          <label
            title="Only roles where the company holds a UK sponsor licence, or the posting says it sponsors"
            style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', fontSize: 12, color: 'var(--c-text-muted)', userSelect: 'none' }}
          >
            <input type="checkbox" checked={sponsorOnly} onChange={e => setSponsorOnly(e.target.checked)}
              style={{ accentColor: 'var(--c-teal)', width: 14, height: 14, cursor: 'pointer' }} />
            Sponsors only
          </label>
        )}

        {/* Most remote listings name regions that exclude Africa, so this is
            on by default — otherwise the majority of results are unusable. */}
        {mode === 'remote' && <label
          title="Only roles whose listing says someone based in Nigeria may apply (worldwide, EMEA, Africa or Nigeria)"
          style={{
            display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer',
            fontSize: 12, color: 'var(--c-text-muted)', userSelect: 'none',
          }}
        >
          <input
            type="checkbox"
            checked={africaOnly}
            onChange={e => setAfricaOnly(e.target.checked)}
            style={{ accentColor: 'var(--c-teal)', width: 14, height: 14, cursor: 'pointer' }}
          />
          Open to Nigeria only
        </label>}

        <label
          title="Postings with scam red flags (fees, Telegram interviews, requests for BVN, phishing links) are hidden unless this is ticked"
          style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', fontSize: 12, color: 'var(--c-text-muted)', userSelect: 'none' }}
        >
          <input type="checkbox" checked={showRisky} onChange={e => setShowRisky(e.target.checked)}
            style={{ accentColor: 'var(--c-red)', width: 14, height: 14, cursor: 'pointer' }} />
          Show possible scams
        </label>
      </div>

      {/* Which boards answered, and how many survived the eligibility filter */}
      {searched && sourceOutcomes.length > 0 && (
        <div style={{
          margin: '10px 32px 0', display: 'flex', alignItems: 'center', gap: 10,
          flexWrap: 'wrap', fontSize: 11, color: 'var(--c-text-dim)', flexShrink: 0,
        }}>
          {sourceOutcomes.map(o => (
            <span
              key={o.source}
              title={o.ok ? `${o.count} result(s)` : `Unavailable: ${o.error ?? 'failed'}`}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '3px 9px', borderRadius: 999,
                background: 'var(--c-bg-2)', border: '1px solid var(--c-border)',
                color: o.ok ? 'var(--c-text-muted)' : 'var(--c-red)',
              }}
            >
              <span style={{
                width: 5, height: 5, borderRadius: '50%',
                background: o.ok ? 'var(--c-teal-fill)' : 'var(--c-red)',
              }} />
              {SOURCE_LABELS[o.source]} {o.ok ? o.count : 'down'}
            </span>
          ))}
          {mode === 'nigeria' ? null : mode === 'remote' ? (
            <span>
              {eligibleCount} open to Nigeria
              {!africaOnly && ' — tick the filter to show only those'}
            </span>
          ) : (
            <span>
              {sponsorCount} licensed UK sponsor{sponsorCount === 1 ? '' : 's'}
              {sponsorAsOf && ` · register of ${sponsorAsOf}`}
            </span>
          )}
          {suspiciousCount > 0 && (
            <span style={{ color: 'var(--c-red)' }}>
              · {suspiciousCount} possible scam{suspiciousCount === 1 ? '' : 's'} {showRisky ? 'flagged' : 'hidden'}
            </span>
          )}
        </div>
      )}

      {alertNote && (
        <div role="status" style={{ margin: '12px 32px 0', fontSize: 12, color: 'var(--c-teal)', background: 'var(--c-teal-dim)', borderRadius: 'var(--r-md)', padding: '8px 12px', flexShrink: 0, display: 'flex', justifyContent: 'space-between', gap: 10 }}>
          <span>{alertNote}</span>
          <button aria-label="Dismiss" onClick={() => setAlertNote(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', display: 'flex' }}><X size={12} /></button>
        </div>
      )}

      {/* A form problem is shown live, ahead of any earlier server error. */}
      {(formError || error) && (
        <div role="alert" style={{ margin: '12px 32px 0', fontSize: 12, color: 'var(--c-danger-text)', background: 'var(--c-danger-bg)', border: '1px solid var(--c-danger-border)', borderRadius: 'var(--r-md)', padding: '8px 12px', flexShrink: 0 }}>
          {formError ?? error}
        </div>
      )}

      {/* Body: results list + detail panel */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Results */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 24px', minWidth: 0 }}>
          {searching ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12, color: 'var(--c-text-muted)' }}>
              <Loader2 size={26} style={{ animation: 'spin 1s linear infinite', color: 'var(--c-violet)' }} />
              <p style={{ fontSize: 13 }}>Searching job boards and company sites…</p>
            </div>
          ) : !searched ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12, color: 'var(--c-text-dim)', textAlign: 'center' }}>
              <BriefcaseBusiness size={44} style={{ opacity: 0.2 }} />
              <div>
                <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-text-muted)', marginBottom: 4 }}>Search live job listings</p>
                <p style={{ fontSize: 12, lineHeight: 1.6, maxWidth: 340 }}>
                  Results are pooled from LinkedIn, remote job boards, Nigerian job sites and the hiring pages of companies that hire Nigerians, then checked for scam red flags. Jobs matching your saved skills get a match badge.
                </p>
              </div>
            </div>
          ) : results.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 24px', color: 'var(--c-text-dim)', fontSize: 13 }}>
              No results match every filter — try broader keywords, a longer date range, or a different mode.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: detail ? undefined : 780 }}>
              {results.map(job => {
                const matches = matchedSkills(job.title, skills)
                const isActive = detail?.id === job.id
                const onBoard = tracked.find(job)
                return (
                  <div key={job.id} onClick={() => openDetail(job)} style={{
                    background: isActive ? 'var(--c-violet-dim)' : 'var(--c-bg-2)',
                    border: `1px solid ${isActive ? 'rgba(124,92,252,0.3)' : 'var(--c-border)'}`,
                    borderRadius: 'var(--r-lg)', padding: '15px 18px',
                    cursor: 'pointer', transition: 'border-color 0.15s',
                  }}
                    onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.borderColor = 'var(--c-border-md)' }}
                    onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.borderColor = 'var(--c-border)' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
                      <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-text)', lineHeight: 1.4 }}>
                        {job.title}
                        {detailLoading === job.id && <Loader2 size={12} style={{ animation: 'spin 1s linear infinite', marginLeft: 8, verticalAlign: -1, color: 'var(--c-violet)' }} />}
                      </p>
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignSelf: 'flex-start' }}>
                      <button
                        aria-label={`Tailor CV for ${job.title}`}
                        title="Curate a CV for this job in the CV Builder"
                        onClick={e => { e.stopPropagation(); tailorCv(job) }}
                        disabled={tailoring !== null}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 5,
                          padding: '5px 12px', borderRadius: 999,
                          background: 'var(--c-violet-dim)', border: '1px solid rgba(124,92,252,0.2)',
                          color: 'var(--c-violet)', fontSize: 11, fontWeight: 600,
                          cursor: tailoring ? 'default' : 'pointer', fontFamily: 'var(--font-body)',
                        }}>
                        {tailoring === job.id ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <FileText size={11} />}
                        Tailor CV
                      </button>
                      <button
                        aria-label={onBoard ? `On your board: ${STATUS_LABELS[onBoard.status]}. Open Applications` : 'Add to applications'}
                        title={onBoard ? `Already on your Applications board as ${onBoard.role} at ${onBoard.company} (${STATUS_LABELS[onBoard.status]}). Click to open it.` : 'Add to your Applications board'}
                        onClick={e => { e.stopPropagation(); if (onBoard) router.push('/applications'); else addToApplications(job) }}
                        disabled={adding === job.id}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 5,
                          padding: '5px 12px', borderRadius: 999,
                          background: onBoard ? 'rgba(0,168,133,0.1)' : 'var(--c-bg-4)',
                          border: `1px solid ${onBoard ? 'rgba(0,168,133,0.25)' : 'var(--c-border)'}`,
                          color: onBoard ? 'var(--c-teal)' : 'var(--c-text-muted)',
                          fontSize: 11, fontWeight: 600, cursor: 'pointer',
                          fontFamily: 'var(--font-body)',
                        }}>
                        {adding === job.id ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> : onBoard ? <Check size={11} /> : <Plus size={11} />}
                        {onBoard ? STATUS_LABELS[onBoard.status] : 'Track'}
                      </button>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', fontSize: 12, color: 'var(--c-text-muted)' }}>
                      {job.company && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Building2 size={11} />{job.company}</span>}
                      {job.location && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><MapPin size={11} />{job.location}</span>}
                      {timeAgo(job.date) && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Clock size={11} />{timeAgo(job.date)}</span>}
                      {matches.length > 0 && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 9px', borderRadius: 999, background: 'var(--c-violet-dim)', color: 'var(--c-violet)', fontWeight: 600, fontSize: 10, border: '1px solid rgba(124,92,252,0.15)' }}>
                          <Sparkles size={10} /> {matches.join(', ')}
                        </span>
                      )}
                      {job.source && job.source !== 'linkedin' && (
                        <span style={{ padding: '2px 8px', borderRadius: 999, background: 'var(--c-bg-4)', color: 'var(--c-text-dim)', fontWeight: 600, fontSize: 10 }}>
                          {SOURCE_LABELS[job.source]}
                        </span>
                      )}
                      <RiskBadge risk={job.risk} />
                      {/* The board's own wording is the tooltip, so the user can
                          second-guess the classification rather than trust it blindly. */}
                      {job.eligibility === 'africa-ok' && (
                        <span
                          title={job.eligibilityNote ? `Board says: ${job.eligibilityNote}` : undefined}
                          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 9px', borderRadius: 999, background: 'rgba(0,168,133,0.1)', color: 'var(--c-teal)', fontWeight: 600, fontSize: 10, border: '1px solid rgba(0,168,133,0.22)' }}>
                          <Check size={10} /> Open to Nigeria
                        </span>
                      )}
                      {job.ukSponsor && (
                        <span
                          title={`On the UK register of licensed sponsors${job.ukSponsorMatchedAs ? ` as "${job.ukSponsorMatchedAs}"` : ''}. A licence means they can sponsor, not that they will for this role.`}
                          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 9px', borderRadius: 999, background: 'rgba(0,168,133,0.1)', color: 'var(--c-teal)', fontWeight: 600, fontSize: 10, border: '1px solid rgba(0,168,133,0.22)' }}>
                          <Check size={10} /> UK sponsor
                        </span>
                      )}
                      {job.visa === 'offers' && (
                        <span
                          title="The posting itself mentions visa sponsorship or relocation support"
                          style={{ padding: '2px 9px', borderRadius: 999, background: 'var(--c-violet-dim)', color: 'var(--c-violet)', fontWeight: 600, fontSize: 10 }}>
                          Mentions sponsorship
                        </span>
                      )}
                      {job.eligibility === 'restricted' && (
                        <span
                          title={`Board says: ${job.eligibilityNote}`}
                          style={{ padding: '2px 9px', borderRadius: 999, background: 'var(--c-red-dim)', color: 'var(--c-red)', fontWeight: 600, fontSize: 10 }}>
                          Region-restricted
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}

              <button onClick={loadMore} disabled={loadingMore}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                  padding: '10px', borderRadius: 'var(--r-md)', marginTop: 4,
                  background: 'var(--c-bg-3)', border: '1px solid var(--c-border)',
                  color: 'var(--c-text-muted)', fontSize: 13, cursor: 'pointer',
                  fontFamily: 'var(--font-body)',
                }}>
                {loadingMore ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : null}
                {loadingMore ? 'Loading…' : 'Load more results'}
              </button>
            </div>
          )}
        </div>

        {/* Detail panel */}
        {detail && (
          <div style={{ width: 440, flexShrink: 0, borderLeft: '1px solid var(--c-border)', overflowY: 'auto', padding: '22px 26px', background: 'var(--c-bg-3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 4 }}>
              <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--c-text)', lineHeight: 1.35 }}>{detail.title}</h2>
              <button aria-label="Close details" onClick={() => setDetail(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-text-muted)', padding: 4, flexShrink: 0 }}>
                <X size={16} />
              </button>
            </div>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12, color: 'var(--c-text-muted)', marginBottom: 14 }}>
              {detail.company && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Building2 size={11} />{detail.company}</span>}
              {detail.location && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><MapPin size={11} />{detail.location}</span>}
            </div>

            {/* Scam check: the reasons, not just the verdict */}
            {detail.risk && (detail.risk.level === 'suspicious' || detail.risk.level === 'caution') && (
              <div style={{
                background: RISK_BADGE[detail.risk.level].bg, borderRadius: 'var(--r-md)', padding: '10px 14px', marginBottom: 14,
                color: RISK_BADGE[detail.risk.level].color, fontSize: 12,
              }}>
                <p style={{ fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <ShieldAlert size={12} /> {detail.risk.level === 'suspicious' ? 'This posting shows signs of a scam' : 'Check this posting carefully'}
                </p>
                <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
                  {detail.risk.reasons.map(r => <li key={r}>{r}</li>)}
                </ul>
                <p style={{ marginTop: 6, opacity: 0.85 }}>Genuine employers never charge applicants or ask for your BVN, bank login or OTP.</p>
              </div>
            )}

            {/* Criteria chips */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
              {[detail.seniority, detail.employmentType, detail.jobFunction].filter(Boolean).map((c, i) => (
                <span key={i} style={{ fontSize: 10, padding: '3px 10px', borderRadius: 999, background: 'var(--c-bg-4)', color: 'var(--c-text-dim)', fontWeight: 600 }}>{c}</span>
              ))}
            </div>

            {/* Skill match summary */}
            {skills.length > 0 && (
              <div style={{
                background: detailMatches.length > 0 ? 'var(--c-violet-dim)' : 'var(--c-bg-4)',
                border: `1px solid ${detailMatches.length > 0 ? 'rgba(124,92,252,0.2)' : 'var(--c-border)'}`,
                borderRadius: 'var(--r-md)', padding: '10px 14px', marginBottom: 16,
              }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: detailMatches.length > 0 ? 'var(--c-violet)' : 'var(--c-text-dim)', marginBottom: detailMatches.length > 0 ? 6 : 0 }}>
                  <Sparkles size={11} style={{ verticalAlign: -1, marginRight: 4 }} />
                  {detailMatches.length > 0
                    ? `Matches ${detailMatches.length} of your ${skills.length} skills`
                    : 'No direct skill matches found'}
                </p>
                {detailMatches.length > 0 && (
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    {detailMatches.map(s => (
                      <span key={s} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 999, background: 'rgba(124,92,252,0.12)', color: 'var(--c-violet)', fontWeight: 600 }}>{s}</span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* AI fit analysis */}
            {detail.description && !fit && (
              <button onClick={analyzeFit} disabled={analyzing}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                  width: '100%', padding: '10px 14px', borderRadius: 'var(--r-md)', marginBottom: 16,
                  background: analyzing ? 'var(--c-bg-4)' : 'var(--c-violet-dim)',
                  border: '1px solid rgba(124,92,252,0.3)',
                  color: 'var(--c-violet)', fontSize: 12, fontWeight: 600,
                  cursor: analyzing ? 'default' : 'pointer', fontFamily: 'var(--font-body)',
                }}>
                {analyzing ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Sparkles size={13} />}
                {analyzing ? 'Analyzing your fit…' : 'Analyze fit with AI'}
              </button>
            )}
            {fitError && (
              <div style={{ fontSize: 12, color: 'var(--c-danger-text)', background: 'var(--c-danger-bg)', border: '1px solid var(--c-danger-border)', borderRadius: 'var(--r-md)', padding: '8px 12px', marginBottom: 16 }}>
                {fitError}
              </div>
            )}
            {fit && (
              <div style={{ background: 'var(--c-bg-2)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-lg)', padding: '16px 18px', marginBottom: 16 }}>
                {/* Score */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                  <span style={{
                    fontSize: 22, fontWeight: 800,
                    color: fit.score >= 70 ? 'var(--c-teal)' : fit.score >= 45 ? 'var(--c-gold)' : 'var(--c-red)',
                  }}>{fit.score}%</span>
                  <div style={{ flex: 1, height: 6, background: 'var(--c-bg-4)', borderRadius: 999, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 999, width: `${fit.score}%`,
                      background: fit.score >= 70 ? 'var(--c-teal-fill)' : fit.score >= 45 ? 'var(--c-gold)' : 'var(--c-red)',
                      transition: 'width 0.6s ease',
                    }} />
                  </div>
                </div>
                <p style={{ fontSize: 12, color: 'var(--c-text-muted)', lineHeight: 1.6, marginBottom: 12 }}>{fit.verdict}</p>

                {fit.strengths.length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--c-teal)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 5 }}>Strengths</p>
                    {fit.strengths.map((s, i) => (
                      <p key={i} style={{ fontSize: 12, color: 'var(--c-text-muted)', lineHeight: 1.55, marginBottom: 4, paddingLeft: 12, position: 'relative' }}>
                        <span style={{ position: 'absolute', left: 0, color: 'var(--c-teal)' }}>✓</span>{s}
                      </p>
                    ))}
                  </div>
                )}
                {fit.gaps.length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--c-red)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 5 }}>Gaps</p>
                    {fit.gaps.map((g, i) => (
                      <p key={i} style={{ fontSize: 12, color: 'var(--c-text-muted)', lineHeight: 1.55, marginBottom: 4, paddingLeft: 12, position: 'relative' }}>
                        <span style={{ position: 'absolute', left: 0, color: 'var(--c-red)' }}>–</span>{g}
                      </p>
                    ))}
                  </div>
                )}
                {fit.advice.length > 0 && (
                  <div>
                    <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--c-violet)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 5 }}>How to apply</p>
                    {fit.advice.map((a, i) => (
                      <p key={i} style={{ fontSize: 12, color: 'var(--c-text-muted)', lineHeight: 1.55, marginBottom: 4, paddingLeft: 12, position: 'relative' }}>
                        <span style={{ position: 'absolute', left: 0, color: 'var(--c-violet)' }}>→</span>{a}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            <button
              onClick={() => tailorCv(detail)}
              disabled={tailoring !== null}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, width: '100%', justifyContent: 'center',
                padding: '10px 14px', borderRadius: 'var(--r-md)', marginBottom: 8,
                background: 'var(--c-coral-fill)', border: 'none', color: '#fff',
                fontSize: 12, fontWeight: 700, cursor: tailoring ? 'default' : 'pointer',
                fontFamily: 'var(--font-body)', opacity: tailoring && tailoring !== detail.id ? 0.6 : 1,
              }}>
              {tailoring === detail.id ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <FileText size={13} />}
              {tailoring === detail.id ? 'Fetching the job description…' : 'Tailor my CV to this job'}
            </button>
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              <button
                onClick={() => (detailOnBoard ? router.push('/applications') : addToApplications(detail))}
                disabled={adding === detail.id}
                title={detailOnBoard ? `Already on your board (${STATUS_LABELS[detailOnBoard.status]}). Click to open Applications.` : undefined}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, flex: 1, justifyContent: 'center',
                  padding: '9px 14px', borderRadius: 'var(--r-md)',
                  background: detailOnBoard ? 'rgba(0,168,133,0.1)' : 'var(--c-bg-2)',
                  border: detailOnBoard ? '1px solid rgba(0,168,133,0.25)' : '1px solid var(--c-border-md)',
                  color: detailOnBoard ? 'var(--c-teal)' : 'var(--c-text)',
                  fontSize: 12, fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-body)',
                }}>
                {adding === detail.id ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : detailOnBoard ? <Check size={12} /> : <Plus size={12} />}
                {detailOnBoard ? `On your board · ${STATUS_LABELS[detailOnBoard.status]}` : 'Track application'}
              </button>
              <a href={detail.url} target="_blank" rel="noopener noreferrer"
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center',
                  padding: '9px 14px', borderRadius: 'var(--r-md)',
                  background: 'var(--c-bg-4)', border: '1px solid var(--c-border)',
                  color: 'var(--c-text-muted)', fontSize: 12, fontWeight: 600,
                  textDecoration: 'none', fontFamily: 'var(--font-body)',
                }}>
                <ExternalLink size={12} /> View on {detail.source ? SOURCE_LABELS[detail.source] : 'site'}
              </a>
            </div>

            {/* Description */}
            {detail.description ? (
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-text-dim)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>Job Description</p>
                <div style={{ fontSize: 13, color: 'var(--c-text-muted)', lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>
                  {detail.description}
                </div>
              </div>
            ) : (
              <p style={{ fontSize: 12, color: 'var(--c-text-dim)' }}>
                Full description unavailable — open the listing on {detail.source ? SOURCE_LABELS[detail.source] : 'the site'} to read it.
              </p>
            )}
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
