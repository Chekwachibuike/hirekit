'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, FileText, Briefcase, Mail,
  FolderKanban, Settings, ExternalLink,
  BrainCircuit, Calendar, Search, MessageSquare, UserCircle, ClipboardCheck,
} from 'lucide-react'

const NAV_MAIN = [
  { href: '/dashboard',      label: 'Dashboard',      icon: LayoutDashboard },
  { href: '/personal-info',  label: 'Personal Info',  icon: UserCircle },
  { href: '/applications',   label: 'Applications',   icon: Briefcase },
  { href: '/cv-builder',     label: 'CV Builder',     icon: FileText },
  { href: '/cover-letters',  label: 'Cover Letters',  icon: Mail },
  { href: '/projects',       label: 'Projects',       icon: FolderKanban },
]

const NAV_AI = [
  { href: '/interview-prep', label: 'Interview Prep', icon: BrainCircuit },
  { href: '/skills',         label: 'Skills Audit',   icon: ClipboardCheck },
  { href: '/job-search',     label: 'Job Search',     icon: Search },
  { href: '/calendar',       label: 'Calendar',       icon: Calendar },
  { href: '/whatsapp',       label: 'WhatsApp',       icon: MessageSquare },
]

function NavItem({ href, label, icon: Icon }: { href: string; label: string; icon: React.ElementType }) {
  const path = usePathname()
  const active = path === href || path.startsWith(href + '/')

  return (
    <Link href={href} style={{
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
      {/* Active indicator bar */}
      <span style={{
        position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)',
        width: 3, height: active ? 18 : 0, borderRadius: 999,
        background: 'var(--c-violet)', transition: 'height 0.2s ease',
      }} />
      <Icon size={16} strokeWidth={active ? 2.4 : 2} />
      {label}
    </Link>
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
        {NAV_MAIN.map(item => <NavItem key={item.href} {...item} />)}

        <SectionLabel label="AI Tools" />
        {NAV_AI.map(item => <NavItem key={item.href} {...item} />)}
      </nav>

      {/* Portfolio link */}
      <div style={{ padding: '10px 12px 6px' }}>
        <a href="http://localhost:3001" target="_blank" rel="noopener noreferrer" style={{
          display: 'flex', alignItems: 'center', gap: 9,
          padding: '10px 12px', borderRadius: 'var(--r-md)',
          background: 'var(--c-teal-dim)',
          border: '1px solid color-mix(in srgb, var(--c-teal) 22%, transparent)',
          color: 'var(--c-teal)', fontSize: 12.5, fontWeight: 600,
          textDecoration: 'none', transition: 'all 0.15s',
        }}
          onMouseEnter={(e) => (e.currentTarget.style.boxShadow = 'var(--shadow-sm)')}
          onMouseLeave={(e) => (e.currentTarget.style.boxShadow = 'none')}
        >
          <ExternalLink size={13} />
          View Portfolio
          <span style={{
            marginLeft: 'auto', fontSize: 9.5, fontWeight: 700, padding: '2px 7px',
            background: 'color-mix(in srgb, var(--c-teal) 16%, transparent)',
            borderRadius: 999, letterSpacing: '0.04em',
          }}>LIVE</span>
        </a>
      </div>

      {/* Settings */}
      <div style={{ padding: '0 12px' }}>
        <NavItem href="/settings" label="Settings" icon={Settings} />
      </div>
    </aside>
  )
}
