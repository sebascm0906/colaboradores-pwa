import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../App'
import { TOKENS, getTypo } from '../../tokens'
import { getTeam, getTeamRoutes } from './api'

export default function ScreenVendedores() {
  const { session } = useSession()
  const navigate = useNavigate()
  const [sw, setSw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])
  const [team, setTeam] = useState([])
  const [routes, setRoutes] = useState([])
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
      const [t, r] = await Promise.all([
        getTeam().catch(() => []),
        getTeamRoutes().catch(() => []),
      ])
      setTeam(t || [])
      setRoutes(r || [])
    } catch { /* empty */ }
    finally { setLoading(false) }
  }

  // Map routes by driver
  const routeByDriver = {}
  routes.forEach(r => {
    const key = r.driver_id || r.chofer_id || r.user_id
    if (key) routeByDriver[key] = r
  })

  const totalVendedores = team.length
  const conRuta = team.filter(v => routeByDriver[v.id]).length
  const completadas = routes.filter(r => r.state === 'done' || r.state === 'completed').length

  function stateLabel(state) {
    const map = { draft: 'Pendiente', in_progress: 'En ruta', done: 'Completada', completed: 'Completada', cancelled: 'Cancelada' }
    return map[state] || state || 'Pendiente'
  }

  function stateColor(state) {
    if (state === 'done' || state === 'completed') return TOKENS.colors.success
    if (state === 'in_progress') return TOKENS.colors.blue2
    if (state === 'cancelled') return TOKENS.colors.error
    return TOKENS.colors.warning
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
          <span style={{ ...typo.title, color: TOKENS.colors.textSoft }}>Mi Equipo</span>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
            <div style={{ width: 32, height: 32, border: '2px solid rgba(255,255,255,0.12)', borderTop: '2px solid #2B8FE0', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : (
          <>
            {/* Summary */}
            <div style={{
              marginTop: 8, padding: 16, borderRadius: TOKENS.radius.xl,
              background: TOKENS.glass.hero, border: `1px solid ${TOKENS.colors.borderBlue}`,
              boxShadow: `${TOKENS.shadow.md}, ${TOKENS.shadow.inset}`,
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                <StatMini label="Vendedores" value={totalVendedores} color={TOKENS.colors.blue2} />
                <StatMini label="Con Ruta" value={conRuta} color={TOKENS.colors.success} />
                <StatMini label="Completadas" value={completadas} color={TOKENS.colors.blue3} />
              </div>
            </div>

            {/* Team list */}
            <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginTop: 24, marginBottom: 12 }}>VENDEDORES</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {team.map(v => {
                const route = routeByDriver[v.id]
                return (
                  <div key={v.id} style={{
                    padding: '14px 16px', borderRadius: TOKENS.radius.lg,
                    background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
                    boxShadow: TOKENS.shadow.soft,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1 }}>
                        <p style={{ ...typo.title, color: TOKENS.colors.text, margin: 0 }}>{v.name || v.display_name}</p>
                        {v.phone && <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, marginTop: 2 }}>{v.phone}</p>}
                      </div>
                      {route && (
                        <div style={{
                          padding: '4px 10px', borderRadius: TOKENS.radius.pill,
                          background: `${stateColor(route.state)}14`,
                          border: `1px solid ${stateColor(route.state)}30`,
                        }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: stateColor(route.state) }}>{stateLabel(route.state)}</span>
                        </div>
                      )}
                    </div>

                    {route ? (
                      <div style={{ marginTop: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ ...typo.caption, color: TOKENS.colors.textMuted }}>Progreso</span>
                          <span style={{ ...typo.caption, color: TOKENS.colors.textSoft, fontWeight: 600 }}>{route.progress || 0}%</span>
                        </div>
                        <div style={{ height: 6, borderRadius: TOKENS.radius.pill, background: TOKENS.colors.surface, overflow: 'hidden' }}>
                          <div style={{
                            height: '100%', borderRadius: TOKENS.radius.pill,
                            width: `${Math.min(route.progress || 0, 100)}%`,
                            background: stateColor(route.state),
                            transition: 'width 0.3s ease',
                          }} />
                        </div>
                      </div>
                    ) : (
                      <p style={{ ...typo.caption, color: TOKENS.colors.textLow, margin: 0, marginTop: 8, fontStyle: 'italic' }}>Sin ruta hoy</p>
                    )}
                  </div>
                )
              })}

              {team.length === 0 && (
                <div style={{ padding: 24, borderRadius: TOKENS.radius.xl, background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`, textAlign: 'center' }}>
                  <p style={{ ...typo.title, color: TOKENS.colors.text }}>Sin vendedores</p>
                  <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, marginTop: 6 }}>No se encontraron miembros del equipo.</p>
                </div>
              )}
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
