import Link from 'next/link'

export default function NotFound() {
  return (
    <div style={{
      minHeight: 'calc(100vh - var(--topbar-h))',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'var(--c-bg)',
      padding: '40px 24px',
    }}>
      <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--c-violet)', marginBottom: 12 }}>
        404
      </p>
      <h1 style={{ fontSize: 32, fontWeight: 700, color: 'var(--c-text)', letterSpacing: '-0.03em', marginBottom: 10 }}>
        Page not found
      </h1>
      <p style={{ fontSize: 14, color: 'var(--c-text-muted)', marginBottom: 32, textAlign: 'center', maxWidth: 340, lineHeight: 1.6 }}>
        The page you're looking for doesn't exist or has been moved.
      </p>
      <Link href="/dashboard" style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '10px 22px', borderRadius: 'var(--r-md)',
        background: 'var(--c-violet)', color: '#fff',
        fontSize: 13, fontWeight: 600, textDecoration: 'none',
        transition: 'background 0.15s',
      }}>
        Back to Dashboard
      </Link>
    </div>
  )
}
