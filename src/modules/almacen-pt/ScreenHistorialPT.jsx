import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../App'
import { TOKENS, getTypo } from '../../tokens'
import { getDispatchHistory } from './api'

const STATE_MAP = {
  assigned: { label: 'Asignado', color: TOKENS.colors.blue2 },
  confirmed: { label: 'Confirmado', color: TOKENS.colors.warning },
  done: { label: 'Completado', color: TOKENS.colors.success },
  waiting: { label: 'En espera', color: TOKENS.colors.textMuted },
  cancel: { label: 'Cancelado', color: TOKENS.colors.error },
}

export default function ScreenHistorialPT() {
  const { session } = useSession()
  const navigate = useNavigate()
  const [sw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)

  const warehouseId = session?.warehouse_id || 76

  useEffect(() => {
    async function load() {
      try {
        const h = await getDispatchHistory(warehouseId)
        setHistory(h || [])
      } catch { setHistory([]) }
      finally { setLoading(false) }
    }
    load()
  }, [])

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
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 20, paddingBottom: 16 }}>
          <button onClick={() => navigate('/almacen-pt')} style={{
            width: 38, height: 38, borderRadius: TOKENS.radius.md,
            background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
            </svg>
          </button>
          <span style={{ ...typo.title, color: TOKENS.colors.textSoft }}>Historial de Traspasos</span>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
            <div style={{ width: 32, height: 32, border: '2px solid rgba(255,255,255,0.12)', borderTop: '2px solid #2B8FE0', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : history.length === 0 ? (
          <div style={{
            marginTop: 40, padding: 24, borderRadius: TOKENS.radius.xl,
            background: TOKENS.colors.surfaceSoft, border: `1px solid ${TOKENS.colors.border}`,
            textAlign: 'center',
          }}>
            <p style={{ ...typo.body, color: TOKENS.colors.textMuted, margin: 0 }}>Sin traspasos registrados</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {history.map((h, i) => {
              const st = STATE_MAP[h.state] || STATE_MAP.waiting
              const dateStr = h.date ? new Date(h.date).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }) : '—'
              return (
                <div key={h.id || i} style={{
                  padding: 14, borderRadius: TOKENS.radius.lg,
                  background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <p style={{ ...typo.caption, color: TOKENS.colors.textSoft, margin: 0, fontWeight: 600 }}>{h.name || 'Traspaso'}</p>
                      <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, marginTop: 3 }}>
                        {h.origin || '—'} → {h.destination || '—'}
                      </p>
                      <p style={{ ...typo.caption, color: TOKENS.colors.textLow, margin: 0, marginTop: 3 }}>{dateStr}</p>
                    </div>
                    <div style={{
                      padding: '3px 8px', borderRadius: TOKENS.radius.pill,
                      background: `${st.color}15`, border: `1px solid ${st.color}30`,
                    }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: st.color }}>{st.label}</span>
                    </div>
                  </div>
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
