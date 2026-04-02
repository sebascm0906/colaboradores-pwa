import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../App'
import { TOKENS, getTypo } from '../../tokens'
import { getReturns } from './api'

export default function ScreenDevoluciones() {
  const { session } = useSession()
  const navigate = useNavigate()
  const [sw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])
  const [returns, setReturns] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const warehouseId = session?.warehouse_id || 89

  useEffect(() => {
    async function load() {
      try {
        const r = await getReturns(warehouseId)
        setReturns(r || [])
      } catch (e) { if (e.message !== 'no_session') setError('Error al cargar datos'); setReturns([]) }
      finally { setLoading(false) }
    }
    load()
  }, [])

  function stateBadge(state) {
    const map = {
      draft: { label: 'Borrador', color: TOKENS.colors.textMuted },
      confirmed: { label: 'Confirmado', color: TOKENS.colors.blue2 },
      done: { label: 'Procesado', color: TOKENS.colors.success },
      pending: { label: 'Pendiente', color: TOKENS.colors.warning },
    }
    const s = map[state] || { label: state || '—', color: TOKENS.colors.textMuted }
    return (
      <span style={{ padding: '3px 8px', borderRadius: TOKENS.radius.pill, background: `${s.color}15`, border: `1px solid ${s.color}30`, fontSize: 11, fontWeight: 700, color: s.color }}>{s.label}</span>
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
          <span style={{ ...typo.title, color: TOKENS.colors.textSoft }}>Devoluciones de Ruta</span>
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
        ) : returns.length === 0 ? (
          <div style={{ padding: 24, borderRadius: TOKENS.radius.xl, background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)', textAlign: 'center', marginTop: 20 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>&#x2705;</div>
            <p style={{ ...typo.title, color: TOKENS.colors.success }}>Sin devoluciones pendientes</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {returns.map((ret, i) => (
              <div key={ret.id || i} style={{
                padding: 16, borderRadius: TOKENS.radius.xl,
                background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
                boxShadow: TOKENS.shadow.sm,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div>
                    <p style={{ ...typo.caption, color: TOKENS.colors.textSoft, margin: 0, fontWeight: 600 }}>{ret.route || '—'}</p>
                    <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '2px 0 0' }}>{ret.driver || 'Sin chofer'}</p>
                  </div>
                  {stateBadge(ret.state)}
                </div>

                <div style={{ padding: '10px 12px', borderRadius: TOKENS.radius.md, background: TOKENS.colors.surfaceSoft, border: `1px solid ${TOKENS.colors.border}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ ...typo.caption, color: TOKENS.colors.text, margin: 0, fontWeight: 600 }}>{ret.product || '—'}</p>
                      <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '2px 0 0' }}>
                        Cant: {ret.quantity ?? 0} {ret.reason ? `\u00B7 ${ret.reason}` : ''}
                      </p>
                    </div>
                    <span style={{ fontSize: 16, fontWeight: 700, color: TOKENS.colors.warning, flexShrink: 0, marginLeft: 8 }}>
                      {ret.quantity ?? 0}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        <div style={{ height: 32 }} />
      </div>
    </div>
  )
}
