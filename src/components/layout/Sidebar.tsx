'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import useSWR from 'swr'
import {
  LayoutDashboard, FileText, Briefcase, Mail,
  FolderKanban, Settings, ExternalLink,
  BrainCircuit, Calendar, Search, MessageSquare, UserCircle, ClipboardCheck,
  Globe, Plus,
} from 'lucide-react'
import { fetcher } from '@/lib/fetcher'

// Items whose backing feature is not available everywhere. The key names a
// capability from /api/capabilities; the item is hidden when it is false.
type Capability = 'whatsapp'

interface NavItemDef {
  href: string
  label: string
  icon: React.ElementType
  /** Hidden unless /api/capabilities reports this as available. */
  needs?: Capability
}

const NAV_MAIN: NavItemDef[] = [
  { href: '/dashboard',      label: 'Dashboard',      icon: LayoutDashboard },
  { href: '/personal-info',  label: 'Personal Info',  icon: UserCircle },
  { href: '/applications',   label: 'Applications',   icon: Briefcase },
  { href: '/cv-builder',     label: 'CV Builder',     icon: FileText },
  { href: '/cover-letters',  label: 'Cover Letters',  icon: Mail },
  { href: '/projects',       label: 'Projects',       icon: FolderKanban },
]

const NAV_AI: NavItemDef[] = [
  { href: '/interview-prep', label: 'Interview Prep', icon: BrainCircuit },
  { href: '/skills',         label: 'Skills Audit',   icon: ClipboardCheck },
  { href: '/job-search',     label: 'Job Search',     icon: Search },
  { href: '/calendar',       label: 'Calendar',       icon: Calendar },
  { href: '/whatsapp',       label: 'WhatsApp',       icon: MessageSquare, needs: 'whatsapp' as Capability },
]

function NavItem({ href, label, icon: Icon }: { href: string; label: string; icon: React.ElementType }) {
  const path = usePathname()
  const active = path === href || path.startsWith(href + '/')

  return (
    // The active item is marked by its fill and weight alone; a coloured
    // edge bar was removed as decoration.
    <Link href={href} aria-current={active ? 'page' : undefined} style={{
      position: 'relative',
      display: 'flex', alignItems: 'center', gap: 11,
      padding: '9px 12px 9px 14px', borderRadius: 'var(--r-md)',
      textDecoration: 'none',
      background: active ? 'var(--c-chrome-active)' : 'transparent',
      color: active ? 'var(--c-chrome-text)' : 'var(--c-chrome-muted)',
      fontSize: 13.5, fontWeight: active ? 600 : 500,
      transition: 'background 0.15s, color 0.15s',
    }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.background = 'var(--c-chrome-hover)'
          e.currentTarget.style.color = 'var(--c-chrome-text)'
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.background = 'transparent'
          e.currentTarget.style.color = 'var(--c-chrome-muted)'
        }
      }}
    >
      <Icon size={16} strokeWidth={active ? 2.4 : 2} />
      {label}
    </Link>
  )
}

function PortfolioLink() {
  const { data } = useSWR<{ data: { portfolio_url?: string } | null }>('/api/personal-info', fetcher)
  const raw = data?.data?.portfolio_url?.trim()
  // Accept "mysite.com" as well as a full URL — people type it either way.
  const url = raw ? (/^https?:\/\//i.test(raw) ? raw : `https://${raw}`) : null

  const base: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 9,
    padding: '10px 12px', borderRadius: 'var(--r-md)',
    fontSize: 12.5, fontWeight: 600,
    textDecoration: 'none', transition: 'all 0.15s',
  }

  if (!url) {
    return (
      <Link
        href="/personal-info"
        title="Add your portfolio URL in Personal Info"
        style={{
          ...base,
          background: 'var(--c-chrome-hover)',
          border: '1px dashed var(--c-chrome-border)',
          color: 'var(--c-chrome-muted)',
        }}
      >
        <Globe size={13} />
        Portfolio not set up
        <Plus size={13} style={{ marginLeft: 'auto' }} />
      </Link>
    )
  }

  return (
    <a
      href={url} target="_blank" rel="noopener noreferrer"
      title={url}
      style={{
        ...base,
        background: 'var(--c-teal-dim)',
        border: '1px solid color-mix(in srgb, var(--c-teal) 22%, transparent)',
        color: 'var(--c-teal)',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.boxShadow = 'var(--shadow-sm)')}
      onMouseLeave={(e) => (e.currentTarget.style.boxShadow = 'none')}
    >
      <ExternalLink size={13} />
      View Portfolio
    </a>
  )
}

function SectionLabel({ label }: { label: string }) {
  return (
    <div style={{
      fontSize: 10.5, fontWeight: 700, color: 'var(--c-chrome-dim)',
      letterSpacing: '0.1em', textTransform: 'uppercase',
      padding: '16px 12px 6px',
    }}>
      {label}
    </div>
  )
}

export default function Sidebar() {
  // Until this resolves, capability-gated items stay hidden: showing one that
  // then disappears is worse than it arriving a moment late.
  const { data: caps } = useSWR<Record<string, boolean>>('/api/capabilities', fetcher)
  const available = (item: NavItemDef) => !item.needs || caps?.[item.needs] === true

  return (
    <aside style={{
      position: 'fixed', left: 0, top: 'var(--topbar-h)', bottom: 0,
      width: 'var(--sidebar-w)',
      background: 'var(--c-chrome)',
      // Outer top corner, mirroring the content panel's top-right. Slightly
      // lighter than the header bar above it so the curve actually reads.
      borderTopLeftRadius: 'var(--r-lg)',
      display: 'flex', flexDirection: 'column',
      zIndex: 50, padding: '0 0 14px',
      overflow: 'hidden',
    }}>
      {/* Main nav */}
      <nav style={{ flex: 1, padding: '6px 12px 0', display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto' }}>
        <SectionLabel label="Core" />
        {NAV_MAIN.filter(available).map(item => <NavItem key={item.href} {...item} />)}

        <SectionLabel label="AI Tools" />
        {NAV_AI.filter(available).map(item => <NavItem key={item.href} {...item} />)}
      </nav>

      {/* Portfolio link — the user's own URL from Personal Info. It used to be
          hardcoded to localhost:3001 with a permanent "LIVE" badge, which was
          wrong for everyone and dishonest when nothing was set. */}
      <div style={{ padding: '10px 12px 6px' }}>
        <PortfolioLink />
      </div>

      {/* Settings */}
      <div style={{ padding: '0 12px' }}>
        <NavItem href="/settings" label="Settings" icon={Settings} />
      </div>
    </aside>
  )
}
