import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../App'
import { TOKENS, getTypo } from '../../tokens'
import { getPendingPallets, acceptPallet, rejectPallet } from './api'

export default function ScreenRecepcion() {
  const { session } = useSession()
  const navigate = useNavigate()
  const [sw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])
  const [pallets, setPallets] = useState([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(null)
  const [rejectingId, setRejectingId] = useState(null)
  const [rejectReason, setRejectReason] = useState('')

  const warehouseId = session?.warehouse_id || 76

  useEffect(() => { loadPallets() }, [])

  async function loadPallets() {
    setLoading(true)
    try {
      const p = await getPendingPallets(warehouseId)
      setPallets(p || [])
    } catch { setPallets([]) }
    finally { setLoading(false) }
  }

  async function handleAccept(id) {
    setProcessing(id)
    try {
      await acceptPallet(id)
      setPallets(prev => prev.filter(p => p.id !== id))
    } catch { /* retry */ }
    finally { setProcessing(null) }
  }

  async function handleReject(id) {
    if (!rejectReason.trim()) return
    setProcessing(id)
    try {
      await rejectPallet(id, rejectReason)
      setPallets(prev => prev.filter(p => p.id !== id))
      setRejectingId(null)
      setRejectReason('')
    } catch { /* retry */ }
    finally { setProcessing(null) }
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
          <div style={{ flex: 1 }}>
            <span style={{ ...typo.title, color: TOKENS.colors.textSoft }}>Recepción de Producción</span>
          </div>
          <span style={{ ...typo.caption, color: TOKENS.colors.textMuted }}>{pallets.length} pendientes</span>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
            <div style={{ width: 32, height: 32, border: '2px solid rgba(255,255,255,0.12)', borderTop: '2px solid #2B8FE0', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : pallets.length === 0 ? (
          <div style={{
            marginTop: 40, padding: 24, borderRadius: TOKENS.radius.xl,
            background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>&#x2705;</div>
            <p style={{ ...typo.title, color: TOKENS.colors.success }}>Todo recibido</p>
            <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, marginTop: 6 }}>No hay tarimas pendientes de recepción.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {pallets.map(pallet => (
              <div key={pallet.id} style={{
                padding: 16, borderRadius: TOKENS.radius.xl,
                background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
                boxShadow: TOKENS.shadow.soft,
              }}>
                {/* Info tarima */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <p style={{ ...typo.title, color: TOKENS.colors.text, margin: 0 }}>{pallet.product || 'Producto'}</p>
                    <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, marginTop: 4 }}>
                      Turno: {pallet.shift || '—'} &middot; {pallet.qty || 0} unidades
                    </p>
                  </div>
                  <div style={{
                    padding: '4px 10px', borderRadius: TOKENS.radius.pill,
                    background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)',
                  }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: TOKENS.colors.warning }}>PENDIENTE</span>
                  </div>
                </div>

                {/* Datos */}
                <div style={{
                  display: 'flex', gap: 8, marginBottom: 14,
                  padding: 10, borderRadius: TOKENS.radius.md,
                  background: TOKENS.colors.surfaceSoft, border: `1px solid ${TOKENS.colors.border}`,
                }}>
                  <div style={{ flex: 1, textAlign: 'center' }}>
                    <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0 }}>Kg</p>
                    <p style={{ ...typo.body, color: TOKENS.colors.blue2, fontWeight: 700, margin: 0 }}>{pallet.kg_total || 0}</p>
                  </div>
                  <div style={{ width: 1, background: TOKENS.colors.border }} />
                  <div style={{ flex: 1, textAlign: 'center' }}>
                    <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0 }}>Capas</p>
                    <p style={{ ...typo.body, color: TOKENS.colors.textSoft, fontWeight: 700, margin: 0 }}>{pallet.layers || '—'}</p>
                  </div>
                  <div style={{ width: 1, background: TOKENS.colors.border }} />
                  <div style={{ flex: 1, textAlign: 'center' }}>
                    <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0 }}>Bolsas/capa</p>
                    <p style={{ ...typo.body, color: TOKENS.colors.textSoft, fontWeight: 700, margin: 0 }}>{pallet.bags_per_layer || '—'}</p>
                  </div>
                </div>

                {/* Botones aceptar/rechazar */}
                {rejectingId === pallet.id ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <input
                      type="text" value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                      placeholder="Motivo del rechazo..."
                      style={{
                        width: '100%', padding: '10px 12px', borderRadius: TOKENS.radius.sm,
                        background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(239,68,68,0.3)',
                        color: 'white', fontSize: 13, outline: 'none', fontFamily: 'inherit',
                      }}
                    />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => { setRejectingId(null); setRejectReason('') }}
                        style={{ flex: 1, padding: '10px', borderRadius: TOKENS.radius.sm, background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`, color: TOKENS.colors.textMuted, fontSize: 13, fontWeight: 600 }}>
                        Cancelar
                      </button>
                      <button onClick={() => handleReject(pallet.id)} disabled={!rejectReason.trim() || processing === pallet.id}
                        style={{ flex: 1, padding: '10px', borderRadius: TOKENS.radius.sm, background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: TOKENS.colors.error, fontSize: 13, fontWeight: 600, opacity: processing === pallet.id ? 0.6 : 1 }}>
                        Confirmar Rechazo
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => setRejectingId(pallet.id)}
                      style={{
                        flex: 1, padding: '10px', borderRadius: TOKENS.radius.sm,
                        background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                        color: TOKENS.colors.error, fontSize: 13, fontWeight: 600,
                      }}>
                      Rechazar
                    </button>
                    <button onClick={() => handleAccept(pallet.id)} disabled={processing === pallet.id}
                      style={{
                        flex: 2, padding: '10px', borderRadius: TOKENS.radius.sm,
                        background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)',
                        color: TOKENS.colors.success, fontSize: 13, fontWeight: 600,
                        opacity: processing === pallet.id ? 0.6 : 1,
                      }}>
                      {processing === pallet.id ? 'Procesando...' : 'Aceptar'}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        <div style={{ height: 32 }} />
      </div>
    </div>
  )
}
