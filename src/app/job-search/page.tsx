'use client'
import { useState } from 'react'
import useSWR from 'swr'
import {
  Search, Loader2, MapPin, Building2, Clock, ExternalLink,
  BriefcaseBusiness, Plus, Check, Sparkles, X,
} from 'lucide-react'
import { fetcher } from '@/lib/fetcher'

// Mirrors JobCard / JobDetail in src/lib/linkedin.ts (client copy — the lib
// itself is server-only so we don't import from it here)
type JobSourceId = 'linkedin' | 'remotive' | 'jobicy' | 'remoteok'
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
  /** Whether a Nigeria-based applicant may apply, per the board's own wording. */
  eligibility?: Eligibility
  eligibilityNote?: string | null
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

  // Search form
  const [query, setQuery]       = useState('')
  const [location, setLocation] = useState('')
  const [remote, setRemote]     = useState<Remote>('')
  const [jobage, setJobage]     = useState(7)
  const [africaOnly, setAfricaOnly] = useState(true)
  const [sourceOutcomes, setSourceOutcomes] = useState<SourceOutcome[]>([])
  const [eligibleCount, setEligibleCount]   = useState(0)

  // Results
  const [results, setResults]   = useState<JobCard[]>([])
  const [page, setPage]         = useState(1)
  const [searching, setSearching] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [searched, setSearched] = useState(false)
  const [error, setError]       = useState<string | null>(null)

  // Detail panel
  const [detail, setDetail]         = useState<JobDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState<string | null>(null)

  // Track jobs already added to the Applications board this session
  const [added, setAdded]   = useState<Set<string>>(new Set())
  const [adding, setAdding] = useState<string | null>(null)

  // AI fit analysis — cached per job id so re-opening a job doesn't re-pay the AI call
  const [fitCache, setFitCache]   = useState<Record<string, FitAnalysis>>({})
  const [analyzing, setAnalyzing] = useState(false)
  const [fitError, setFitError]   = useState<string | null>(null)

  function buildParams(p: number) {
    const params = new URLSearchParams({ q: query.trim(), page: String(p) })
    if (location.trim()) params.set('location', location.trim())
    if (remote) params.set('remote', remote)
    if (jobage > 0) params.set('jobage', String(jobage))
    if (africaOnly) params.set('africaOnly', '1')
    return params
  }

  async function search() {
    if (!query.trim() || searching) return
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
      setSearched(true)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Search failed')
    } finally {
      setSearching(false)
    }
  }

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
    setDetailLoading(job.id)
    try {
      const res  = await fetch(`/api/job-search?id=${job.id}`)
      const json = await res.json()
      if (res.ok) setDetail(json.data)
      else setDetail({ ...job, description: null, seniority: null, employmentType: null, jobFunction: null, industries: null, applyUrl: null })
    } catch {
      setDetail({ ...job, description: null, seniority: null, employmentType: null, jobFunction: null, industries: null, applyUrl: null })
    } finally {
      setDetailLoading(null)
    }
  }

  async function addToApplications(job: JobCard | JobDetail) {
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
          notes: `Found via HireKit Job Search (LinkedIn #${job.id})`,
        }),
      })
      if (res.ok) setAdded(s => new Set(s).add(job.id))
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

  return (
    <div style={{ height: 'calc(100vh - var(--topbar-h))', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ padding: '22px 32px 16px', borderBottom: '1px solid var(--c-border)', flexShrink: 0 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--c-text)', letterSpacing: '-0.02em', marginBottom: 3 }}>Job Search</h1>
        <p style={{ fontSize: 12, color: 'var(--c-text-muted)' }}>Live LinkedIn listings — no account needed · matched against your skills</p>
      </div>

      {/* Search bar */}
      <div style={{ padding: '14px 32px', borderBottom: '1px solid var(--c-border)', flexShrink: 0, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--c-bg-2)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', padding: '0 12px', flex: 2, minWidth: 200 }}>
          <Search size={14} color="var(--c-text-muted)" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && search()}
            placeholder="Keywords — e.g. React developer, fullstack, Python…"
            aria-label="Search keywords"
            style={{ flex: 1, padding: '9px 0', background: 'none', border: 'none', outline: 'none', color: 'var(--c-text)', fontSize: 13, fontFamily: 'var(--font-body)' }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--c-bg-2)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', padding: '0 12px', flex: 1, minWidth: 140 }}>
          <MapPin size={14} color="var(--c-text-muted)" />
          <input
            value={location}
            onChange={e => setLocation(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && search()}
            placeholder="Location (optional)"
            aria-label="Location"
            style={{ flex: 1, padding: '9px 0', background: 'none', border: 'none', outline: 'none', color: 'var(--c-text)', fontSize: 13, fontFamily: 'var(--font-body)' }}
          />
        </div>
        <select value={remote} onChange={e => setRemote(e.target.value as Remote)} aria-label="Workplace type"
          style={{ padding: '9px 12px', background: 'var(--c-bg-2)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', color: remote ? 'var(--c-text)' : 'var(--c-text-muted)', fontSize: 12, outline: 'none', fontFamily: 'var(--font-body)', cursor: 'pointer' }}>
          <option value="">Any workplace</option>
          <option value="remote">Remote</option>
          <option value="hybrid">Hybrid</option>
          <option value="onsite">On-site</option>
        </select>
        <select value={jobage} onChange={e => setJobage(Number(e.target.value))} aria-label="Posted within"
          style={{ padding: '9px 12px', background: 'var(--c-bg-2)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', color: 'var(--c-text)', fontSize: 12, outline: 'none', fontFamily: 'var(--font-body)', cursor: 'pointer' }}>
          {JOBAGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <button onClick={search} disabled={searching || !query.trim()}
          style={{
            display: 'flex', alignItems: 'center', gap: 7, padding: '9px 22px',
            borderRadius: 'var(--r-md)',
            background: searching || !query.trim() ? 'var(--c-bg-4)' : 'var(--c-coral)',
            border: 'none', color: '#fff', fontSize: 13, fontWeight: 600,
            cursor: searching || !query.trim() ? 'default' : 'pointer',
            fontFamily: 'var(--font-body)',
          }}>
          {searching ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Search size={14} />}
          Search
        </button>

        {/* Most remote listings name regions that exclude Africa, so this is
            on by default — otherwise the majority of results are unusable. */}
        <label
          title="Only roles whose board says a Nigeria/Africa-based applicant may apply"
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
          Open to Africa only
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
                background: o.ok ? 'var(--c-teal)' : 'var(--c-red)',
              }} />
              {SOURCE_LABELS[o.source]} {o.ok ? o.count : 'down'}
            </span>
          ))}
          <span>
            {eligibleCount} open to Africa
            {!africaOnly && ' — tick the filter to show only those'}
          </span>
        </div>
      )}

      {error && (
        <div style={{ margin: '12px 32px 0', fontSize: 12, color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 'var(--r-md)', padding: '8px 12px', flexShrink: 0 }}>
          {error}
        </div>
      )}

      {/* Body: results list + detail panel */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Results */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 24px', minWidth: 0 }}>
          {searching ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12, color: 'var(--c-text-muted)' }}>
              <Loader2 size={26} style={{ animation: 'spin 1s linear infinite', color: 'var(--c-violet)' }} />
              <p style={{ fontSize: 13 }}>Searching LinkedIn…</p>
            </div>
          ) : !searched ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12, color: 'var(--c-text-dim)', textAlign: 'center' }}>
              <BriefcaseBusiness size={44} style={{ opacity: 0.2 }} />
              <div>
                <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-text-muted)', marginBottom: 4 }}>Search live job listings</p>
                <p style={{ fontSize: 12, lineHeight: 1.6, maxWidth: 340 }}>
                  Results come from LinkedIn&apos;s public listings. Jobs matching your saved skills get a match badge — click one for the full description.
                </p>
              </div>
            </div>
          ) : results.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 24px', color: 'var(--c-text-dim)', fontSize: 13 }}>
              No results — try broader keywords or a different location.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: detail ? undefined : 780 }}>
              {results.map(job => {
                const matches = matchedSkills(job.title, skills)
                const isActive = detail?.id === job.id
                const isAdded = added.has(job.id)
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
                      <button
                        aria-label={isAdded ? 'Added to applications' : 'Add to applications'}
                        onClick={e => { e.stopPropagation(); if (!isAdded) addToApplications(job) }}
                        disabled={isAdded || adding === job.id}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0, alignSelf: 'flex-start',
                          padding: '5px 12px', borderRadius: 999,
                          background: isAdded ? 'rgba(0,168,133,0.1)' : 'var(--c-bg-4)',
                          border: `1px solid ${isAdded ? 'rgba(0,168,133,0.25)' : 'var(--c-border)'}`,
                          color: isAdded ? 'var(--c-teal)' : 'var(--c-text-muted)',
                          fontSize: 11, fontWeight: 600, cursor: isAdded ? 'default' : 'pointer',
                          fontFamily: 'var(--font-body)',
                        }}>
                        {adding === job.id ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> : isAdded ? <Check size={11} /> : <Plus size={11} />}
                        {isAdded ? 'Added' : 'Track'}
                      </button>
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
                      {/* The board's own wording is the tooltip, so the user can
                          second-guess the classification rather than trust it blindly. */}
                      {job.eligibility === 'africa-ok' && (
                        <span
                          title={job.eligibilityNote ? `Board says: ${job.eligibilityNote}` : undefined}
                          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 9px', borderRadius: 999, background: 'rgba(0,168,133,0.1)', color: 'var(--c-teal)', fontWeight: 600, fontSize: 10, border: '1px solid rgba(0,168,133,0.22)' }}>
                          <Check size={10} /> Open to Africa
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
              <div style={{ fontSize: 12, color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 'var(--r-md)', padding: '8px 12px', marginBottom: 16 }}>
                {fitError}
              </div>
            )}
            {fit && (
              <div style={{ background: 'var(--c-bg-2)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-lg)', padding: '16px 18px', marginBottom: 16 }}>
                {/* Score */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                  <span style={{
                    fontSize: 22, fontWeight: 800,
                    color: fit.score >= 70 ? 'var(--c-teal)' : fit.score >= 45 ? 'var(--c-gold)' : '#E03255',
                  }}>{fit.score}%</span>
                  <div style={{ flex: 1, height: 6, background: 'var(--c-bg-4)', borderRadius: 999, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 999, width: `${fit.score}%`,
                      background: fit.score >= 70 ? 'var(--c-teal)' : fit.score >= 45 ? 'var(--c-gold)' : '#E03255',
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
                    <p style={{ fontSize: 10, fontWeight: 700, color: '#E03255', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 5 }}>Gaps</p>
                    {fit.gaps.map((g, i) => (
                      <p key={i} style={{ fontSize: 12, color: 'var(--c-text-muted)', lineHeight: 1.55, marginBottom: 4, paddingLeft: 12, position: 'relative' }}>
                        <span style={{ position: 'absolute', left: 0, color: '#E03255' }}>–</span>{g}
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
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              <button
                onClick={() => !added.has(detail.id) && addToApplications(detail)}
                disabled={added.has(detail.id) || adding === detail.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, flex: 1, justifyContent: 'center',
                  padding: '9px 14px', borderRadius: 'var(--r-md)',
                  background: added.has(detail.id) ? 'rgba(0,168,133,0.1)' : 'var(--c-violet)',
                  border: added.has(detail.id) ? '1px solid rgba(0,168,133,0.25)' : 'none',
                  color: added.has(detail.id) ? 'var(--c-teal)' : '#fff',
                  fontSize: 12, fontWeight: 600,
                  cursor: added.has(detail.id) ? 'default' : 'pointer',
                  fontFamily: 'var(--font-body)',
                }}>
                {adding === detail.id ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : added.has(detail.id) ? <Check size={12} /> : <Plus size={12} />}
                {added.has(detail.id) ? 'On your board' : 'Track application'}
              </button>
              <a href={detail.url} target="_blank" rel="noopener noreferrer"
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center',
                  padding: '9px 14px', borderRadius: 'var(--r-md)',
                  background: 'var(--c-bg-4)', border: '1px solid var(--c-border)',
                  color: 'var(--c-text-muted)', fontSize: 12, fontWeight: 600,
                  textDecoration: 'none', fontFamily: 'var(--font-body)',
                }}>
                <ExternalLink size={12} /> View on LinkedIn
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
                Full description unavailable — open the listing on LinkedIn to read it.
              </p>
            )}
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
