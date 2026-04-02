import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../App'
import { TOKENS, getTypo } from '../../tokens'
import { getTeam, getTeamRoutes } from './api'

export default function ScreenSupervisorVentas() {
  const { session } = useSession()
  const navigate = useNavigate()
  const [sw, setSw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])
  const [team, setTeam] = useState([])
  const [routes, setRoutes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const h = () => setSw(window.innerWidth)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [t, r] = await Promise.all([
        getTeam().catch(() => []),
        getTeamRoutes().catch(() => []),
      ])
      setTeam(t || [])
      setRoutes(r || [])
    } catch (e) { if (e.message !== 'no_session') setError('Error al cargar datos') }
    finally { setLoading(false) }
  }

  const vendedoresActivos = team.filter(v => v.active !== false).length
  const rutasHoy = routes.length
  const avgProgress = routes.length > 0
    ? Math.round(routes.reduce((s, r) => s + (r.progress || 0), 0) / routes.length)
    : 0

  const ACTIONS = [
    { id: 'dashboard', label: 'Dashboard', desc: 'Indicadores generales', route: '/equipo/dashboard',
      color: TOKENS.colors.blue2,
      icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg> },
    { id: 'pronostico', label: 'Pronostico', desc: 'Captura de forecast', route: '/equipo/pronostico',
      color: TOKENS.colors.warning,
      icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg> },
    { id: 'vendedores', label: 'Mi Equipo', desc: `${vendedoresActivos} vendedores`, route: '/equipo/vendedores',
      color: TOKENS.colors.success,
      icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
    { id: 'metas', label: 'Metas', desc: 'Metas del mes', route: '/equipo/metas',
      color: TOKENS.colors.blue3,
      icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg> },
    { id: 'kpis', label: 'KPIs', desc: 'Indicadores clave', route: '/equipo/kpis',
      color: '#a78bfa',
      icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg> },
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
          <span style={{ ...typo.title, color: TOKENS.colors.textSoft }}>Supervision de Ventas</span>
        </div>

        {error && (
          <div style={{ margin: '12px 0', padding: 12, borderRadius: 10, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <p style={{ ...typo.caption, color: '#ef4444', margin: 0 }}>{error}</p>
          </div>
        )}

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
            <div style={{ width: 32, height: 32, border: '2px solid rgba(255,255,255,0.12)', borderTop: '2px solid #2B8FE0', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : (
          <>
            {/* Quick Stats */}
            <div style={{
              marginTop: 8, padding: 16, borderRadius: TOKENS.radius.xl,
              background: TOKENS.glass.hero, border: `1px solid ${TOKENS.colors.borderBlue}`,
              boxShadow: `${TOKENS.shadow.md}, ${TOKENS.shadow.inset}`,
            }}>
              <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginBottom: 12 }}>RESUMEN DEL DIA</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                <StatMini label="Vendedores" value={vendedoresActivos} color={TOKENS.colors.blue2} />
                <StatMini label="Rutas Hoy" value={rutasHoy} color={TOKENS.colors.success} />
                <StatMini label="Progreso" value={`${avgProgress}%`} color={TOKENS.colors.blue3} />
              </div>
            </div>

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
