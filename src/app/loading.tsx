// Shown by Next.js App Router while a page's JS bundle is loading during navigation.
// Renders inside <main> (header + sidebar are already visible from ShellWrapper).
export default function Loading() {
  return (
    <div style={{ padding: '28px 32px' }}>

      {/* Page header skeleton */}
      <div style={{ marginBottom: 28 }}>
        <div className="skeleton" style={{ width: 180, height: 24, marginBottom: 8 }} />
        <div className="skeleton" style={{ width: 260, height: 13 }} />
      </div>

      {/* Top action bar */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        <div className="skeleton" style={{ flex: 1, height: 38, borderRadius: 10 }} />
        <div className="skeleton" style={{ width: 120, height: 38, borderRadius: 10 }} />
      </div>

      {/* Card grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} style={{
            background: '#fff', borderRadius: 16,
            border: '1px solid rgba(0,0,0,0.07)',
            padding: '20px',
            animationDelay: `${i * 0.06}s`,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
              <div className="skeleton" style={{ width: '55%', height: 15 }} />
              <div className="skeleton" style={{ width: 50, height: 20, borderRadius: 999 }} />
            </div>
            <div className="skeleton" style={{ width: '80%', height: 13, marginBottom: 8 }} />
            <div className="skeleton" style={{ width: '60%', height: 13, marginBottom: 18 }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <div className="skeleton" style={{ width: 64, height: 26, borderRadius: 8 }} />
              <div className="skeleton" style={{ width: 64, height: 26, borderRadius: 8 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
