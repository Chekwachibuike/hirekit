'use client'
import Card from './Card'

interface StatCardProps {
  label: string
  value: number | string
  icon: React.ElementType
  /** accent token that carries identity via the icon chip (not the number) */
  color: string
  /** optional secondary line, e.g. "of 42 total" */
  sub?: React.ReactNode
  loading?: boolean
  delay?: number
}

/**
 * KPI tile. Per the dataviz method, the number wears text ink (neutral, strong);
 * the accent color is carried by the icon chip so identity isn't number-color.
 */
export default function StatCard({ label, value, icon: Icon, color, sub, loading, delay = 0 }: StatCardProps) {
  return (
    <Card
      interactive
      pad="18px 18px 16px"
      style={{ animation: `fadeUp 0.45s cubic-bezier(0.22,1,0.36,1) ${delay}s both` }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <span style={{ fontSize: 12.5, color: 'var(--c-text-muted)', fontWeight: 500 }}>{label}</span>
        <div style={{
          width: 32, height: 32, borderRadius: 9, flexShrink: 0,
          background: `color-mix(in srgb, ${color} 15%, transparent)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={15} color={color} strokeWidth={2.2} />
        </div>
      </div>

      {loading ? (
        <span className="skeleton" style={{ display: 'block', width: 52, height: 30, borderRadius: 6 }} />
      ) : (
        <div style={{
          fontSize: 30, fontWeight: 700, color: 'var(--c-text)',
          fontFamily: 'var(--font-mono)', letterSpacing: '-0.02em', lineHeight: 1,
        }}>
          {value}
        </div>
      )}

      {sub && !loading && (
        <div style={{ marginTop: 7, fontSize: 11.5, color: 'var(--c-text-dim)' }}>{sub}</div>
      )}
    </Card>
  )
}
