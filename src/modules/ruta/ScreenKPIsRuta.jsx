import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../App'
import { TOKENS, getTypo } from '../../tokens'
import { getMyTarget, getMyRoutePlan } from './api'

function pctColor(pct) {
  if (pct >= 80) return TOKENS.colors.success
  if (pct >= 50) return TOKENS.colors.warning
  return TOKENS.colors.error
}

function fmt(n) {
  if (n == null) return '—'
  return Number(n).toLocaleString('es-MX', { maximumFractionDigits: 0 })
}

function fmtCurrency(n) {
  if (n == null) return '—'
  return '$' + Number(n).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

export default function ScreenKPIsRuta() {
  const { session } = useSession()
  const navigate = useNavigate()
  const [sw, setSw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])
  const [loading, setLoading] = useState(true)
  const [target, setTarget] = useState(null)
  const [plan, setPlan] = useState(null)

  useEffect(() => {
    const h = () => setSw(window.innerWidth)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])

  useEffect(() => {
    async function load() {
      try {
        const [t, p] = await Promise.all([
          getMyTarget(session?.employee_id).catch(() => null),
          getMyRoutePlan(session?.employee_id).catch(() => null),
        ])
        setTarget(t)
        setPlan(p)
      } catch { /* empty */ }
      finally { setLoading(false) }
    }
    load()
  }, [])

  const salesPct = target?.sales_target > 0 ? Math.round((target.sales_actual / target.sales_target) * 100) : 0
  const collPct = target?.collection_target > 0 ? Math.round((target.collection_actual / target.collection_target) * 100) : 0
  const stopsDone = plan?.stops_done ?? 0
  const stopsTotal = plan?.stops_total ?? 0
  const deliveryPct = stopsTotal > 0 ? Math.round((stopsDone / stopsTotal) * 100) : 0

  return (
    <div style={{ minHeight: '100dvh', background: `linear-gradient(160deg, ${TOKENS.colors.bg0} 0%, ${TOKENS.colors.bg1} 50%, ${TOKENS.colors.bg2} 100%)`, paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap'); * { font-family: 'DM Sans', sans-serif; box-sizing: border-box; } button { border: none; background: none; cursor: pointer; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 16px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 20, paddingBottom: 12 }}>
          <button onClick={() => navigate('/ruta')} style={{ width: 38, height: 38, borderRadius: TOKENS.radius.md, background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
          </button>
          <span style={{ ...typo.title, color: TOKENS.colors.textSoft }}>KPIs y Metas</span>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
            <div style={{ width: 32, height: 32, border: '2px solid rgba(255,255,255,0.12)', borderTop: '2px solid #2B8FE0', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : (
          <>
            {target ? (
              <>
                {/* Sales KPI */}
                <div style={{
                  padding: 16, borderRadius: TOKENS.radius.xl,
                  background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
                  boxShadow: TOKENS.shadow.soft, marginBottom: 12,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0 }}>Venta mensual</p>
                    <span style={{
                      padding: '3px 10px', borderRadius: TOKENS.radius.pill,
                      fontSize: 11, fontWeight: 700,
                      background: `${pctColor(salesPct)}18`,
                      color: pctColor(salesPct),
                      border: `1px solid ${pctColor(salesPct)}30`,
                    }}>
                      {salesPct}%
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
                    <span style={{ ...typo.display, color: TOKENS.colors.text }}>{fmtCurrency(target.sales_actual)}</span>
                    <span style={{ ...typo.body, color: TOKENS.colors.textMuted }}>/ {fmtCurrency(target.sales_target)}</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: TOKENS.colors.surface, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 3,
                      background: pctColor(salesPct),
                      width: `${Math.min(salesPct, 100)}%`,
                      transition: 'width 0.3s ease',
                    }} />
                  </div>
                </div>

                {/* Collection KPI */}
                <div style={{
                  padding: 16, borderRadius: TOKENS.radius.xl,
                  background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
                  boxShadow: TOKENS.shadow.soft, marginBottom: 12,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0 }}>Cobranza mensual</p>
                    <span style={{
                      padding: '3px 10px', borderRadius: TOKENS.radius.pill,
                      fontSize: 11, fontWeight: 700,
                      background: `${pctColor(collPct)}18`,
                      color: pctColor(collPct),
                      border: `1px solid ${pctColor(collPct)}30`,
                    }}>
                      {collPct}%
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
                    <span style={{ ...typo.display, color: TOKENS.colors.text }}>{fmtCurrency(target.collection_actual)}</span>
                    <span style={{ ...typo.body, color: TOKENS.colors.textMuted }}>/ {fmtCurrency(target.collection_target)}</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: TOKENS.colors.surface, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 3,
                      background: pctColor(collPct),
                      width: `${Math.min(collPct, 100)}%`,
                      transition: 'width 0.3s ease',
                    }} />
                  </div>
                </div>
              </>
            ) : (
              <div style={{
                padding: 20, borderRadius: TOKENS.radius.xl,
                background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
                textAlign: 'center', marginBottom: 20,
              }}>
                <p style={{ ...typo.body, color: TOKENS.colors.textMuted, margin: 0 }}>Sin meta asignada este mes</p>
              </div>
            )}

            {/* Route stats */}
            {plan && (
              <>
                <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginTop: 16, marginBottom: 12 }}>RUTA DE HOY</p>
                <div style={{ display: 'flex', gap: 10 }}>
                  {/* Stops */}
                  <div style={{
                    flex: 1, padding: 14, borderRadius: TOKENS.radius.lg,
                    background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
                    textAlign: 'center',
                  }}>
                    <p style={{ ...typo.h1, color: TOKENS.colors.text, margin: 0 }}>{stopsDone}/{stopsTotal}</p>
                    <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '4px 0 0' }}>Paradas</p>
                  </div>
                  {/* Effectiveness */}
                  <div style={{
                    flex: 1, padding: 14, borderRadius: TOKENS.radius.lg,
                    background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
                    textAlign: 'center',
                  }}>
                    <p style={{ ...typo.h1, color: pctColor(deliveryPct), margin: 0 }}>{deliveryPct}%</p>
                    <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '4px 0 0' }}>Efectividad</p>
                  </div>
                  {/* Distance */}
                  <div style={{
                    flex: 1, padding: 14, borderRadius: TOKENS.radius.lg,
                    background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
                    textAlign: 'center',
                  }}>
                    <p style={{ ...typo.h1, color: TOKENS.colors.text, margin: 0 }}>{fmt(plan.distance_km)}</p>
                    <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '4px 0 0' }}>km</p>
                  </div>
                </div>
              </>
            )}

            <div style={{ height: 32 }} />
          </>
        )}
      </div>
    </div>
  )
}
