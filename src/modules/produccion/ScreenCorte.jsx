import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TOKENS, getTypo, TURNO_LABELS } from '../../tokens'
import { getMyShift, getShiftSummary, getCycles, getPackingEntries } from './api'

export default function ScreenCorte() {
  const navigate = useNavigate()
  const [sw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])
  const [loading, setLoading] = useState(true)
  const [shift, setShift] = useState(null)
  const [cycles, setCycles] = useState([])
  const [packing, setPacking] = useState([])
  const [error, setError] = useState('')

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const s = await getMyShift()
      if (!s?.id) { setError('Sin turno activo'); setLoading(false); return }
      setShift(s)

      const [c, p] = await Promise.all([
        getCycles(s.id).catch(() => []),
        getPackingEntries(s.id).catch(() => []),
      ])
      setCycles(c || [])
      setPacking(p || [])
    } catch {
      setError('Error cargando datos')
    } finally {
      setLoading(false)
    }
  }

  // Cálculos
  const totalCycles = cycles.length
  const completedCycles = cycles.filter(c => c.state === 'dumped').length
  const totalKgProduced = shift?.total_kg_produced || cycles.reduce((s, c) => s + (c.kg_dumped || 0), 0)
  const totalKgPacked = packing.reduce((s, p) => s + (p.total_kg || 0), 0)
  const mermaKg = Math.max(0, totalKgProduced - totalKgPacked)
  const mermaPct = totalKgProduced > 0 ? ((mermaKg / totalKgProduced) * 100).toFixed(1) : '0.0'
  const effectiveHours = shift?.effective_hours || 0
  const productivity = effectiveHours > 0 ? (totalKgProduced / effectiveHours).toFixed(0) : '—'
  const yieldPct = shift?.yield_pct ? shift.yield_pct.toFixed(1) : '—'

  // Empaque por producto
  const packingByProduct = {}
  packing.forEach(p => {
    const name = p.product_name || p.product_id?.[1] || 'Bolsa'
    if (!packingByProduct[name]) packingByProduct[name] = { qty: 0, kg: 0 }
    packingByProduct[name].qty += p.qty_bags || 0
    packingByProduct[name].kg += p.total_kg || 0
  })

  return (
    <div style={{
      minHeight: '100dvh',
      background: `linear-gradient(160deg, ${TOKENS.colors.bg0} 0%, ${TOKENS.colors.bg1} 50%, ${TOKENS.colors.bg2} 100%)`,
      paddingTop: 'env(safe-area-inset-top)',
      paddingBottom: 'env(safe-area-inset-bottom)',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap');
        * { font-family: 'DM Sans', sans-serif; box-sizing: border-box; }
        button { border: none; background: none; cursor: pointer; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 16px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 20, paddingBottom: 16 }}>
          <button onClick={() => navigate('/produccion')} style={{
            width: 38, height: 38, borderRadius: TOKENS.radius.md,
            background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
            </svg>
          </button>
          <span style={{ ...typo.title, color: TOKENS.colors.textSoft }}>Corte del Día</span>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
            <div style={{ width: 32, height: 32, border: '2px solid rgba(255,255,255,0.12)', borderTop: '2px solid #2B8FE0', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : error ? (
          <div style={{
            marginTop: 20, padding: 16, borderRadius: TOKENS.radius.lg,
            background: TOKENS.colors.errorSoft, border: '1px solid rgba(239,68,68,0.3)',
            color: TOKENS.colors.error, ...typo.body, textAlign: 'center',
          }}>{error}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Info turno */}
            <div style={{
              padding: 16, borderRadius: TOKENS.radius.xl,
              background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
            }}>
              <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginBottom: 6 }}>TURNO</p>
              <p style={{ ...typo.h2, color: TOKENS.colors.text, margin: 0 }}>{shift?.name || 'Turno activo'}</p>
              <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, marginTop: 4 }}>
                {shift?.date} &middot; {TURNO_LABELS[shift?.shift_code] || `Turno ${shift?.shift_code}`}
              </p>
            </div>

            {/* KPIs principales */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <KpiCard label="Kg Producidos" value={totalKgProduced.toFixed(0)} unit="kg" color={TOKENS.colors.blue2} typo={typo} />
              <KpiCard label="Kg Empacados" value={totalKgPacked.toFixed(0)} unit="kg" color={TOKENS.colors.success} typo={typo} />
              <KpiCard label="Ciclos" value={`${completedCycles}/${totalCycles}`} unit="" color={TOKENS.colors.blue3} typo={typo} />
              <KpiCard label="Merma" value={mermaPct} unit="%" color={parseFloat(mermaPct) > 5 ? TOKENS.colors.error : TOKENS.colors.success} typo={typo} />
            </div>

            {/* Métricas secundarias */}
            <div style={{
              padding: 14, borderRadius: TOKENS.radius.lg,
              background: TOKENS.colors.surfaceSoft, border: `1px solid ${TOKENS.colors.border}`,
              display: 'flex', flexDirection: 'column', gap: 10,
            }}>
              <MetricRow label="Productividad" value={`${productivity} kg/h`} typo={typo} />
              <MetricRow label="Merma absoluta" value={`${mermaKg.toFixed(1)} kg`} typo={typo} />
              <MetricRow label="Rendimiento" value={yieldPct !== '—' ? `${yieldPct}%` : '—'} typo={typo} />
              <MetricRow label="Horas efectivas" value={effectiveHours > 0 ? `${effectiveHours.toFixed(1)} h` : '—'} typo={typo} />
            </div>

            {/* Desglose por producto */}
            {Object.keys(packingByProduct).length > 0 && (
              <>
                <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginTop: 4 }}>DESGLOSE POR PRODUCTO</p>
                <div style={{
                  borderRadius: TOKENS.radius.lg, overflow: 'hidden',
                  border: `1px solid ${TOKENS.colors.border}`,
                }}>
                  {Object.entries(packingByProduct).map(([name, data], i) => (
                    <div key={name} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '12px 14px',
                      background: i % 2 === 0 ? TOKENS.colors.surfaceSoft : 'transparent',
                      borderBottom: i < Object.keys(packingByProduct).length - 1 ? `1px solid ${TOKENS.colors.border}` : 'none',
                    }}>
                      <div>
                        <p style={{ ...typo.caption, color: TOKENS.colors.textSoft, margin: 0, fontWeight: 600 }}>{name}</p>
                        <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, marginTop: 2 }}>{data.qty} bolsas</p>
                      </div>
                      <span style={{ ...typo.body, color: TOKENS.colors.success, fontWeight: 700 }}>{data.kg.toFixed(0)} kg</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Botón volver */}
            <button
              onClick={() => navigate('/produccion')}
              style={{
                width: '100%', padding: '14px', marginTop: 8,
                borderRadius: TOKENS.radius.lg,
                background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
                color: TOKENS.colors.textSoft, fontSize: 15, fontWeight: 600,
              }}
            >
              Volver al turno
            </button>

            <div style={{ height: 24 }} />
          </div>
        )}
      </div>
    </div>
  )
}

function KpiCard({ label, value, unit, color, typo }) {
  return (
    <div style={{
      padding: 14, borderRadius: TOKENS.radius.lg,
      background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
      boxShadow: TOKENS.shadow.soft,
    }}>
      <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, marginBottom: 6 }}>{label}</p>
      <p style={{ margin: 0, fontSize: 26, fontWeight: 700, color, letterSpacing: '-0.03em', lineHeight: 1 }}>
        {value}
        {unit && <span style={{ fontSize: 14, fontWeight: 500, color: TOKENS.colors.textMuted, marginLeft: 4 }}>{unit}</span>}
      </p>
    </div>
  )
}

function MetricRow({ label, value, typo }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ ...typo.caption, color: TOKENS.colors.textMuted }}>{label}</span>
      <span style={{ ...typo.body, color: TOKENS.colors.textSoft, fontWeight: 600 }}>{value}</span>
    </div>
  )
}
