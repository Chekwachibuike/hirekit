// Flags job postings that look like recruitment scams.
//
// Three layers, cheapest first:
//   1. Text red flags — the patterns behind most job scams aimed at Nigerian
//      applicants: fees, Telegram/WhatsApp-only interviews, requests for BVN
//      or bank details, reshipping and "payment processing" mule work.
//   2. Public threat databases — OpenPhish (active phishing URLs) and
//      abuse.ch URLhaus (malware-hosting domains). Any domain a posting links
//      to or gives as a contact is checked against both.
//   3. Domain age via RDAP, the public successor to WHOIS — scam sites are
//      usually registered weeks before the posting goes up.
//
// No single signal proves fraud, so the result is a level plus the reasons,
// and the UI shows the reasons. Server-side only.

import type { SourcedJob } from './job-sources'

export type RiskLevel = 'verified' | 'ok' | 'caution' | 'suspicious'

export interface RiskAssessment {
  level: RiskLevel
  reasons: string[]
}

interface Rule {
  re: RegExp
  reason: string
  /** Match the title alone: the words also appear in honest descriptions
   *  (accounting software mentions "data entry"). */
  titleOnly?: boolean
}

// Any one of these is enough to call a posting suspicious: legitimate
// employers do not charge applicants or interview over Telegram.
const STRONG: Rule[] = [
  { re: /\b(registration|application|processing|training|onboarding|medical|interview|screening|starter|equipment|visa processing|form)\s+(fee|charge|levy)s?\b/i,
    reason: 'Asks applicants to pay a fee' },
  { re: /\b(pay|send|transfer|deposit)\b[^.]{0,30}\b(fee|deposit|money|payment)\b[^.]{0,30}\b(before|to (secure|confirm|book|start|process)|upfront|in advance)\b/i,
    reason: 'Asks for money up front' },
  { re: /\brefundable\s+(fee|deposit)\b/i, reason: 'Mentions a "refundable" fee' },
  { re: /\b(send|mail) you a (cheque|check)\b|\bbuy (your own )?(equipment|starter kit|laptop) (from|through) (us|our (vendor|supplier))\b/i,
    reason: 'Cheque-for-equipment pattern (a classic overpayment scam)' },
  { re: /\b(interview|contact|reach|message|chat|apply)\w*\b[^.]{0,40}\b(on|via|through|using)\s+(telegram|whatsapp|signal|wickr|google hangouts)\b/i,
    reason: 'Interviews or applications run over a chat app' },
  { re: /\bt\.me\/|\bwa\.me\/|\bchat\.whatsapp\.com\//i, reason: 'Applies through a Telegram or WhatsApp link' },
  { re: /\b(send|provide|submit|share)\b[^.]{0,40}\b(bvn|bank (account )?(details|login)|atm card|card pin|otp|nin slip)\b/i,
    reason: 'Requests BVN or bank details' },
  { re: /\b(reshipping|re-shipping|package forwarding|parcel forwarding|payment processing (agent|assistant)|money transfer agent|funds? transfer (agent|assistant))\b/i,
    reason: 'Reshipping or payment-processing role (common money-mule scheme)' },
  { re: /\b(invest|deposit)\b[^.]{0,30}\b(usdt|bitcoin|btc|crypto)\b[^.]{0,30}\b(to (start|begin|activate|unlock))\b/i,
    reason: 'Requires a crypto deposit to start' },
]

// Common in genuine small-company postings too, so each only lowers trust.
const WEAK: Rule[] = [
  { re: /[\w.+-]+@(gmail|yahoo|ymail|outlook|hotmail|live|aol|proton(mail)?|icloud|mail)\.(com|me|ng)\b/i,
    reason: 'Uses a personal email address rather than a company one' },
  { re: /\b(earn|make)\s+(up to\s+)?(\$|usd|£|€|₦|ngn|n)\s?\d[\d,]*k?\s*(\+\s*)?(per|a|\/|every)\s*(hour|day|week)\b/i,
    reason: 'Advertises earnings per day or week' },
  { re: /\bno (prior )?experience (required|needed|necessary)\b[\s\S]{0,200}\b(\$|usd|£|€)\s?\d{3,}/i,
    reason: 'High pay with no experience required' },
  { re: /\b(data entry|typing job|copy[- ]paste|mystery shopper|online survey)\b/i, titleOnly: true,
    reason: 'Category often used for scams (data entry, typing, surveys)' },
  { re: /\b(urgent(ly)?\s+(hiring|needed|recruit)|limited (slots|spaces)|act (fast|now)|apply immediately)\b/i,
    reason: 'High-pressure urgency' },
  { re: /\b(bit\.ly|tinyurl\.com|cutt\.ly|shorturl\.at|rb\.gy|is\.gd|tiny\.cc)\//i,
    reason: 'Hides its link behind a URL shortener' },
  { re: /\b(guaranteed (job|placement|employment|income)|100% (job )?guarantee)\b/i,
    reason: 'Promises a guaranteed job or income' },
]

// ── Domains ───────────────────────────────────────────────────────

/** Job boards, ATS hosts and big platforms: linking to them says nothing
 *  about the employer, so they are not looked up. */
const KNOWN_HOSTS = new Set([
  'linkedin.com', 'remotive.com', 'jobicy.com', 'remoteok.com', 'arbeitnow.com', 'himalayas.app',
  'workingnomads.com', 'weworkremotely.com', 'hotnigerianjobs.com', 'greenhouse.io', 'lever.co',
  'ashbyhq.com', 'workable.com', 'smartrecruiters.com', 'breezy.hr', 'google.com', 'forms.gle',
  'youtube.com', 'facebook.com', 'instagram.com', 'twitter.com', 'x.com', 'github.com',
  'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com', 'proton.me', 'protonmail.com',
  'myjobmag.com', 'jobberman.com', 'indeed.com', 'glassdoor.com', 'wellfound.com',
])

/** Two-label public suffixes, so "acme.com.ng" is the domain, not "com.ng". */
const SECOND_LEVEL = /^(com|co|org|net|gov|edu|ac|sch|mil)$/

function registrableDomain(host: string): string {
  const parts = host.toLowerCase().replace(/^www\./, '').split('.').filter(Boolean)
  if (parts.length <= 2) return parts.join('.')
  const take = SECOND_LEVEL.test(parts[parts.length - 2]) ? 3 : 2
  return parts.slice(-take).join('.')
}

function isKnown(domain: string): boolean {
  return KNOWN_HOSTS.has(domain)
}

/** Domains a posting links to or gives as a contact address. */
function domainsIn(text: string): string[] {
  const hosts = new Set<string>()
  for (const m of Array.from(text.matchAll(/https?:\/\/([a-z0-9.-]+\.[a-z]{2,})/gi))) hosts.add(m[1])
  for (const m of Array.from(text.matchAll(/\bwww\.([a-z0-9.-]+\.[a-z]{2,})/gi))) hosts.add(m[1])
  for (const m of Array.from(text.matchAll(/[\w.+-]+@([a-z0-9.-]+\.[a-z]{2,})/gi))) hosts.add(m[1])
  return Array.from(hosts)
}

// ── Threat databases ──────────────────────────────────────────────

const THREAT_TTL = 6 * 60 * 60 * 1000
let threats: { at: number; hosts: Promise<Set<string>> } | null = null

async function fetchList(url: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(10000), cache: 'no-store' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.text()
}

/** Hostnames from OpenPhish and URLhaus, refreshed every six hours. Either
 *  feed failing leaves the other in force; both failing leaves an empty set,
 *  and the text checks still run. */
function threatHosts(): Promise<Set<string>> {
  if (threats && Date.now() - threats.at < THREAT_TTL) return threats.hosts
  const hosts = (async () => {
    const set = new Set<string>()
    const [phish, haus] = await Promise.allSettled([
      fetchList('https://openphish.com/feed.txt'),
      fetchList('https://urlhaus.abuse.ch/downloads/hostfile/'),
    ])
    if (phish.status === 'fulfilled') {
      for (const line of phish.value.split('\n')) {
        try { set.add(new URL(line.trim()).hostname.toLowerCase()) } catch { /* blank or malformed */ }
      }
    }
    if (haus.status === 'fulfilled') {
      for (const line of haus.value.split('\n')) {
        // "127.0.0.1\tbad.example.com"; comments start with #
        const host = line.startsWith('#') ? '' : line.trim().split(/\s+/)[1]
        if (host) set.add(host.toLowerCase())
      }
    }
    if (phish.status === 'rejected' && haus.status === 'rejected') {
      // Retry sooner than six hours when both feeds were unreachable.
      threats = null
    }
    return set
  })()
  threats = { at: Date.now(), hosts }
  return hosts
}

// ── Domain age (RDAP) ─────────────────────────────────────────────

const AGE_TTL = 24 * 60 * 60 * 1000
const ageCache = new Map<string, { at: number; days: Promise<number | null> }>()

/** Days since the domain was registered, or null when RDAP cannot say
 *  (unsupported TLD, timeout). Unknown is never treated as a red flag. */
function domainAgeDays(domain: string): Promise<number | null> {
  const hit = ageCache.get(domain)
  if (hit && Date.now() - hit.at < AGE_TTL) return hit.days
  const days = (async () => {
    try {
      const res = await fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
        signal: AbortSignal.timeout(4000), cache: 'no-store',
        headers: { Accept: 'application/rdap+json, application/json' },
      })
      if (!res.ok) return null
      const data = await res.json() as { events?: { eventAction?: string; eventDate?: string }[] }
      const reg = data.events?.find(e => e.eventAction === 'registration')?.eventDate
      if (!reg) return null
      const t = new Date(reg).getTime()
      return Number.isNaN(t) ? null : Math.floor((Date.now() - t) / 86400000)
    } catch {
      return null
    }
  })()
  ageCache.set(domain, { at: Date.now(), days })
  return days
}

/** RDAP lookups per search. Each is a network call, and most postings link
 *  only to boards, so a handful covers the employer domains that appear. */
const MAX_AGE_LOOKUPS = 12

// ── Assessment ────────────────────────────────────────────────────

/** Annotates each job with a risk level and the reasons behind it. */
export async function assessJobs(jobs: SourcedJob[]): Promise<(SourcedJob & { risk: RiskAssessment })[]> {
  const texts = jobs.map(j => `${j.title ?? ''}\n${j.company ?? ''}\n${j.description ?? ''}`)
  const domainsByJob = jobs.map((j, i) => {
    const all = [...domainsIn(texts[i]), ...domainsIn(j.url)]
    return Array.from(new Set(all.map(registrableDomain))).filter(d => !isKnown(d))
  })

  const blocked = await threatHosts().catch(() => new Set<string>())

  const toAge = Array.from(new Set(domainsByJob.flat())).slice(0, MAX_AGE_LOOKUPS)
  const ages = new Map<string, number | null>()
  await Promise.all(toAge.map(async d => ages.set(d, await domainAgeDays(d))))

  return jobs.map((j, i) => {
    const strong: string[] = []
    const weak: string[] = []
    const text = texts[i]

    const hit = (r: Rule) => r.re.test(r.titleOnly ? j.title ?? '' : text)
    for (const r of STRONG) if (hit(r)) strong.push(r.reason)
    for (const r of WEAK) if (hit(r)) weak.push(r.reason)

    // Check full hostnames too: threat feeds list subdomains of shared hosts
    // (pages.dev, vercel.app) that the registrable domain would miss.
    const hosts = [...domainsIn(text), ...domainsIn(j.url)].map(h => h.toLowerCase().replace(/^www\./, ''))
    const listed = hosts.find(h => blocked.has(h) || blocked.has(`www.${h}`))
    if (listed) strong.push(`Links to ${listed}, listed in a phishing/malware database`)

    for (const d of domainsByJob[i]) {
      const age = ages.get(d)
      if (age === null || age === undefined) continue
      if (age < 30) strong.push(`${d} was registered ${age} day${age === 1 ? '' : 's'} ago`)
      else if (age < 180) weak.push(`${d} was registered only ${Math.round(age / 30)} months ago`)
    }

    // Feeds read straight from an employer's own ATS, and companies on the
    // UK sponsor register, are real employers. Text flags still override.
    const verified = j.source === 'companies' || j.ukSponsor === true

    const level: RiskLevel = strong.length ? 'suspicious'
      : weak.length ? 'caution'
      : verified ? 'verified'
      : 'ok'
    return { ...j, risk: { level, reasons: [...strong, ...weak] } }
  })
}
