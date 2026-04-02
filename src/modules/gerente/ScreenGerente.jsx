import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../App'
import { TOKENS, getTypo } from '../../tokens'
import { getAlerts, getKpiSummary } from './api'

export default function ScreenGerente() {
  const { session } = useSession()
  const navigate = useNavigate()
  const [sw, setSw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])
  const [alerts, setAlerts] = useState([])
  const [kpi, setKpi] = useState(null)
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
      const [a, k] = await Promise.all([
        getAlerts().catch(() => []),
        getKpiSummary().catch(() => null),
      ])
      setAlerts(a || [])
      setKpi(k || null)
    } catch { /* empty */ }
    finally { setLoading(false) }
  }

  const alertCount = alerts.length
  const sucursal = session?.sucursal || session?.branch_name || ''

  const ACTIONS = [
    { id: 'dashboard', label: 'Dashboard', desc: 'Indicadores generales', route: '/gerente/dashboard',
      color: TOKENS.colors.blue2,
      icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg> },
    { id: 'alertas', label: 'Alertas', desc: alertCount > 0 ? `${alertCount} alertas hoy` : 'Sin alertas', route: '/gerente/alertas',
      color: alertCount > 0 ? TOKENS.colors.error : TOKENS.colors.success,
      badge: alertCount > 0 ? alertCount : null,
      icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg> },
    { id: 'forecast', label: 'Forecast', desc: 'Desbloquear forecasts', route: '/gerente/forecast',
      color: TOKENS.colors.warning,
      icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> },
    { id: 'admin', label: 'Admin Sucursal', desc: 'Configuracion de sucursal', route: '/admin',
      color: TOKENS.colors.blue3,
      icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg> },
  ]

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
          <button onClick={() => navigate('/')} style={{
            width: 38, height: 38, borderRadius: TOKENS.radius.md,
            background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
          </button>
          <span style={{ ...typo.title, color: TOKENS.colors.textSoft }}>Gerente de Sucursal</span>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
            <div style={{ width: 32, height: 32, border: '2px solid rgba(255,255,255,0.12)', borderTop: '2px solid #2B8FE0', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : (
          <>
            {/* Sucursal chip */}
            {sucursal && (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '5px 14px', borderRadius: TOKENS.radius.pill,
                background: TOKENS.colors.blueGlow, border: `1px solid ${TOKENS.colors.borderBlue}`,
                marginBottom: 12,
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={TOKENS.colors.blue2} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                <span style={{ ...typo.caption, color: TOKENS.colors.blue3, fontWeight: 600 }}>{sucursal}</span>
              </div>
            )}

            {/* KPI Summary Card */}
            {kpi && (
              <div style={{
                marginTop: 4, padding: 16, borderRadius: TOKENS.radius.xl,
                background: TOKENS.glass.hero, border: `1px solid ${TOKENS.colors.borderBlue}`,
                boxShadow: `${TOKENS.shadow.md}, ${TOKENS.shadow.inset}`,
              }}>
                <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginBottom: 12 }}>RESUMEN DEL DIA</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  <StatMini label="Venta Hoy" value={kpi.sales_today ?? '-'} color={TOKENS.colors.blue2} />
                  <StatMini label="Forecast" value={kpi.forecast ?? '-'} color={TOKENS.colors.warning} />
                  <StatMini label="Disponible" value={kpi.available ?? '-'} color={TOKENS.colors.success} />
                </div>
              </div>
            )}

            <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginTop: 24, marginBottom: 12 }}>GESTION</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {ACTIONS.map(a => (
                <button key={a.id} onClick={() => navigate(a.route)} style={{
                  display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: TOKENS.radius.lg,
                  background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
                  boxShadow: TOKENS.shadow.soft, width: '100%', textAlign: 'left', cursor: 'pointer',
                  position: 'relative',
                }}>
                  <div style={{
                    width: 42, height: 42, borderRadius: TOKENS.radius.md,
                    background: `${a.color}14`, border: `1px solid ${a.color}30`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: a.color, flexShrink: 0,
                  }}>{a.icon}</div>
                  <div style={{ flex: 1 }}>
                    <p style={{ ...typo.title, color: TOKENS.colors.text, margin: 0 }}>{a.label}</p>
                    <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, marginTop: 2 }}>{a.desc}</p>
                  </div>
                  {a.badge && (
                    <div style={{
                      minWidth: 22, height: 22, borderRadius: 11, padding: '0 6px',
                      background: a.color, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#fff' }}>{a.badge}</span>
                    </div>
                  )}
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
                </button>
              ))}
            </div>
            <div style={{ height: 32 }} />
          </>
        )}
      </div>
    </div>
  )
}

function StatMini({ label, value, color }) {
  return (
    <div style={{ padding: '8px 6px', borderRadius: TOKENS.radius.sm, background: TOKENS.glass.panelSoft, border: `1px solid ${TOKENS.colors.border}`, textAlign: 'center' }}>
      <p style={{ fontSize: 9, fontWeight: 600, color: TOKENS.colors.textMuted, margin: 0, letterSpacing: '0.1em' }}>{label}</p>
      <p style={{ fontSize: 16, fontWeight: 700, color, margin: 0, marginTop: 2, letterSpacing: '-0.02em' }}>{value}</p>
    </div>
  )
}
