import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../App'
import { TOKENS, getTypo } from '../../tokens'
import { getTodayRoutes, confirmLoad } from './api'

export default function ScreenPreparaCarga() {
  const { session } = useSession()
  const navigate = useNavigate()
  const [sw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])
  const [routes, setRoutes] = useState([])
  const [loading, setLoading] = useState(true)
  const [confirming, setConfirming] = useState(null)
  const [error, setError] = useState('')

  const warehouseId = session?.warehouse_id || 89

  useEffect(() => { loadRoutes() }, [])

  async function loadRoutes() {
    setLoading(true)
    try {
      const r = await getTodayRoutes(warehouseId)
      setRoutes(r || [])
    } catch (e) { if (e.message !== 'no_session') setError('Error al cargar datos'); setRoutes([]) }
    finally { setLoading(false) }
  }

  async function handleConfirm(routePlanId) {
    setConfirming(routePlanId)
    try {
      await confirmLoad(routePlanId)
      await loadRoutes()
    } catch (e) { if (e.message !== 'no_session') setError('Error al confirmar carga') }
    finally { setConfirming(null) }
  }

  const stateColors = {
    draft: TOKENS.colors.textMuted,
    published: TOKENS.colors.blue2,
    in_progress: TOKENS.colors.warning,
    closed: TOKENS.colors.success,
  }

  const stateLabels = {
    draft: 'Borrador',
    published: 'Publicada',
    in_progress: 'En Progreso',
    closed: 'Cerrada',
  }

  function stateBadge(state) {
    const color = stateColors[state] || TOKENS.colors.textMuted
    const label = stateLabels[state] || state || '—'
    return (
      <span style={{ padding: '3px 8px', borderRadius: TOKENS.radius.pill, background: `${color}15`, border: `1px solid ${color}30`, fontSize: 11, fontWeight: 700, color }}>{label}</span>
    )
  }

  return (
    <div style={{ minHeight: '100dvh', background: `linear-gradient(160deg, ${TOKENS.colors.bg0} 0%, ${TOKENS.colors.bg1} 50%, ${TOKENS.colors.bg2} 100%)`, paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap');
        * { font-family: 'DM Sans', sans-serif; box-sizing: border-box; }
        button { border: none; background: none; cursor: pointer; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 16px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 20, paddingBottom: 16 }}>
          <button onClick={() => navigate('/entregas')} style={{
            width: 38, height: 38, borderRadius: TOKENS.radius.md,
            background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
            </svg>
          </button>
          <span style={{ ...typo.title, color: TOKENS.colors.textSoft }}>Preparar Carga</span>
        </div>

        {error && (
          <div style={{ margin: '12px 0', padding: 12, borderRadius: 10, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <p style={{ ...typo.caption, color: '#ef4444', margin: 0 }}>{error}</p>
          </div>
        )}

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 40 }}>
            <div style={{ width: 32, height: 32, border: '2px solid rgba(255,255,255,0.12)', borderTop: '2px solid #2B8FE0', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : routes.length === 0 ? (
          <div style={{ padding: 24, borderRadius: TOKENS.radius.xl, background: TOKENS.colors.surfaceSoft, border: `1px solid ${TOKENS.colors.border}`, textAlign: 'center', marginTop: 20 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>&#x1F6E3;&#xFE0F;</div>
            <p style={{ ...typo.body, color: TOKENS.colors.textMuted, margin: 0 }}>Sin rutas programadas para hoy</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {routes.map((route, i) => {
              const progress = route.stops_total > 0 ? Math.round((route.stops_done / route.stops_total) * 100) : 0
              const canConfirm = route.state === 'published' && !route.load_sealed
              return (
                <div key={route.id || i} style={{
                  padding: 16, borderRadius: TOKENS.radius.xl,
                  background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
                  boxShadow: TOKENS.shadow.sm,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                    <div>
                      <p style={{ ...typo.h2, color: TOKENS.colors.text, margin: 0, fontSize: 16 }}>{route.name || '—'}</p>
                      <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '4px 0 0' }}>{route.driver || 'Sin chofer'}</p>
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      {route.load_sealed && (
                        <span style={{ padding: '3px 8px', borderRadius: TOKENS.radius.pill, background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)', fontSize: 11, fontWeight: 700, color: TOKENS.colors.success }}>Cargada</span>
                      )}
                      {stateBadge(route.state)}
                    </div>
                  </div>

                  {/* Stops + Progress */}
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ ...typo.caption, color: TOKENS.colors.textMuted }}>Paradas: {route.stops_done || 0} / {route.stops_total || 0}</span>
                      <span style={{ ...typo.caption, color: TOKENS.colors.textMuted }}>{progress}%</span>
                    </div>
                    <div style={{ width: '100%', height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)' }}>
                      <div style={{ width: `${progress}%`, height: '100%', borderRadius: 3, background: `linear-gradient(90deg, ${TOKENS.colors.blue2}, ${TOKENS.colors.success})`, transition: 'width 0.3s' }} />
                    </div>
                  </div>

                  {/* Confirm button */}
                  {canConfirm && (
                    <button onClick={() => handleConfirm(route.id)} disabled={confirming === route.id} style={{
                      width: '100%', padding: 12, borderRadius: TOKENS.radius.lg,
                      background: 'linear-gradient(90deg, #15499B, #2B8FE0)', color: 'white',
                      fontSize: 14, fontWeight: 600, opacity: confirming === route.id ? 0.6 : 1,
                      boxShadow: '0 8px 20px rgba(43,143,224,0.25)',
                    }}>
                      {confirming === route.id ? 'Confirmando...' : 'Confirmar Carga'}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
        <div style={{ height: 32 }} />
      </div>
    </div>
  )
}
