import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../App'
import { TOKENS, getTypo } from '../../tokens'
import { getTeamTargets } from './api'
import { logScreenError } from '../shared/logScreenError'

export default function ScreenMetasVendedores() {
  const { session } = useSession()
  const navigate = useNavigate()
  const [sw, setSw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])
  const [targets, setTargets] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const h = () => setSw(window.innerWidth)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const t = await getTeamTargets().catch((e) => {
        logScreenError('ScreenMetasVendedores', 'getTeamTargets', e)
        return []
      })
      setTargets(t || [])
    } catch (e) { logScreenError('ScreenMetasVendedores', 'loadData', e) }
    finally { setLoading(false) }
  }

  function pctColor(pct) {
    if (pct >= 80) return TOKENS.colors.success
    if (pct >= 50) return TOKENS.colors.warning
    return TOKENS.colors.error
  }

  // Team totals
  const totalSalesTarget = targets.reduce((s, t) => s + (t.sales_target || 0), 0)
  const totalSalesActual = targets.reduce((s, t) => s + (t.sales_actual || 0), 0)
  const totalCollTarget = targets.reduce((s, t) => s + (t.collection_target || 0), 0)
  const totalCollActual = targets.reduce((s, t) => s + (t.collection_actual || 0), 0)
  const overallSalesPct = totalSalesTarget > 0 ? Math.round((totalSalesActual / totalSalesTarget) * 100) : 0
  const overallCollPct = totalCollTarget > 0 ? Math.round((totalCollActual / totalCollTarget) * 100) : 0

  function fmtMoney(n) {
    if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`
    if (n >= 1000) return `$${(n / 1000).toFixed(0)}K`
    return `$${n.toFixed(0)}`
  }

  return (
    <div style={{
      minHeight: '100dvh',
      background: `linear-gradient(160deg, ${TOKENS.colors.bg0} 0%, ${TOKENS.colors.bg1} 50%, ${TOKENS.colors.bg2} 100%)`,
      paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap');
        * { font-family: 'DM Sans', sans-serif; box-sizing: border-box; }
        button { border: none; background: none; cursor: pointer; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 20, paddingBottom: 12 }}>
          <button onClick={() => navigate('/equipo')} style={{
            width: 38, height: 38, borderRadius: TOKENS.radius.md,
            background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
          </button>
          <span style={{ ...typo.title, color: TOKENS.colors.textSoft }}>Metas del Mes</span>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
            <div style={{ width: 32, height: 32, border: '2px solid rgba(255,255,255,0.12)', borderTop: '2px solid #2B8FE0', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : targets.length === 0 ? (
          <div style={{ marginTop: 40, padding: 24, borderRadius: TOKENS.radius.xl, background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`, textAlign: 'center' }}>
            <p style={{ ...typo.title, color: TOKENS.colors.text }}>Sin metas configuradas</p>
            <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, marginTop: 6 }}>No hay metas registradas para este mes.</p>
          </div>
        ) : (
          <>
            {/* Team summary */}
            <div style={{
              marginTop: 8, padding: 16, borderRadius: TOKENS.radius.xl,
              background: TOKENS.glass.hero, border: `1px solid ${TOKENS.colors.borderBlue}`,
              boxShadow: `${TOKENS.shadow.md}, ${TOKENS.shadow.inset}`,
            }}>
              <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginBottom: 12 }}>EQUIPO TOTAL</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={{ padding: 10, borderRadius: TOKENS.radius.md, background: TOKENS.colors.surfaceSoft, border: `1px solid ${TOKENS.colors.border}` }}>
                  <p style={{ fontSize: 9, fontWeight: 600, color: TOKENS.colors.textMuted, margin: 0, letterSpacing: '0.1em' }}>VENTAS</p>
                  <p style={{ fontSize: 18, fontWeight: 700, color: pctColor(overallSalesPct), margin: 0, marginTop: 4 }}>{fmtMoney(totalSalesActual)}</p>
                  <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0 }}>de {fmtMoney(totalSalesTarget)}</p>
                  <div style={{ height: 4, borderRadius: TOKENS.radius.pill, background: TOKENS.colors.surface, marginTop: 6, overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: TOKENS.radius.pill, width: `${Math.min(overallSalesPct, 100)}%`, background: pctColor(overallSalesPct) }} />
                  </div>
                </div>
                <div style={{ padding: 10, borderRadius: TOKENS.radius.md, background: TOKENS.colors.surfaceSoft, border: `1px solid ${TOKENS.colors.border}` }}>
                  <p style={{ fontSize: 9, fontWeight: 600, color: TOKENS.colors.textMuted, margin: 0, letterSpacing: '0.1em' }}>COBRANZA</p>
                  <p style={{ fontSize: 18, fontWeight: 700, color: pctColor(overallCollPct), margin: 0, marginTop: 4 }}>{fmtMoney(totalCollActual)}</p>
                  <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0 }}>de {fmtMoney(totalCollTarget)}</p>
                  <div style={{ height: 4, borderRadius: TOKENS.radius.pill, background: TOKENS.colors.surface, marginTop: 6, overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: TOKENS.radius.pill, width: `${Math.min(overallCollPct, 100)}%`, background: pctColor(overallCollPct) }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Individual vendedores */}
            <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginTop: 24, marginBottom: 12 }}>POR VENDEDOR</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {targets.map((t, i) => {
                const salesPct = t.sales_target > 0 ? Math.round((t.sales_actual / t.sales_target) * 100) : 0
                const collPct = t.collection_target > 0 ? Math.round((t.collection_actual / t.collection_target) * 100) : 0
                return (
                  <div key={t.id || i} style={{
                    padding: '14px 16px', borderRadius: TOKENS.radius.lg,
                    background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
                    boxShadow: TOKENS.shadow.soft,
                  }}>
                    <p style={{ ...typo.title, color: TOKENS.colors.text, margin: 0, marginBottom: 12 }}>{t.vendedor_name || t.name}</p>

                    {/* Sales row */}
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ ...typo.caption, color: TOKENS.colors.textMuted }}>Ventas</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ ...typo.caption, color: TOKENS.colors.textSoft }}>{fmtMoney(t.sales_actual || 0)} / {fmtMoney(t.sales_target || 0)}</span>
                          <div style={{
                            padding: '2px 8px', borderRadius: TOKENS.radius.pill,
                            background: `${pctColor(salesPct)}14`, border: `1px solid ${pctColor(salesPct)}30`,
                          }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: pctColor(salesPct) }}>{salesPct}%</span>
                          </div>
                        </div>
                      </div>
                      <div style={{ height: 6, borderRadius: TOKENS.radius.pill, background: TOKENS.colors.surface, overflow: 'hidden' }}>
                        <div style={{ height: '100%', borderRadius: TOKENS.radius.pill, width: `${Math.min(salesPct, 100)}%`, background: pctColor(salesPct), transition: 'width 0.3s ease' }} />
                      </div>
                    </div>

                    {/* Collection row */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ ...typo.caption, color: TOKENS.colors.textMuted }}>Cobranza</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ ...typo.caption, color: TOKENS.colors.textSoft }}>{fmtMoney(t.collection_actual || 0)} / {fmtMoney(t.collection_target || 0)}</span>
                          <div style={{
                            padding: '2px 8px', borderRadius: TOKENS.radius.pill,
                            background: `${pctColor(collPct)}14`, border: `1px solid ${pctColor(collPct)}30`,
                          }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: pctColor(collPct) }}>{collPct}%</span>
                          </div>
                        </div>
                      </div>
                      <div style={{ height: 6, borderRadius: TOKENS.radius.pill, background: TOKENS.colors.surface, overflow: 'hidden' }}>
                        <div style={{ height: '100%', borderRadius: TOKENS.radius.pill, width: `${Math.min(collPct, 100)}%`, background: pctColor(collPct), transition: 'width 0.3s ease' }} />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            <div style={{ height: 32 }} />
          </>
        )}
      </div>
    </div>
  )
}
