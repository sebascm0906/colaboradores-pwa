import { useEffect, useMemo, useState, useCallback } from 'react'
import { useSession } from '../../App'
import { TOKENS, getTypo } from '../../tokens'
import { softWarehouse } from '../../lib/sessionGuards'
import { getPendingPallets, getReadyPallets, acceptPallet, rejectPallet } from './entregasService'
import { ScreenShell, ConfirmDialog, EmptyState } from './components'
import SessionErrorState from '../../components/SessionErrorState'

export default function ScreenRecibirPT() {
  const { session } = useSession()
  const [sw, setSw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])

  const [pending, setPending] = useState([])
  const [ready, setReady] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Per-pallet action states: { [id]: 'accepting'|'rejecting' }
  const [actionStates, setActionStates] = useState({})

  // Dialog state
  const [dialog, setDialog] = useState(null) // { type:'accept'|'reject', pallet }
  const [rejectReason, setRejectReason] = useState('')

  // Toast
  const [toast, setToast] = useState(null)

  const warehouseId = softWarehouse(session)

  useEffect(() => {
    const h = () => setSw(window.innerWidth)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])

  const loadData = useCallback(async () => {
    if (!warehouseId) { setLoading(false); return }
    setLoading(true)
    setError('')
    try {
      const [p, r] = await Promise.all([
        getPendingPallets(warehouseId).catch(() => []),
        getReadyPallets(warehouseId).catch(() => []),
      ])
      setPending(Array.isArray(p) ? p : [])
      setReady(Array.isArray(r) ? r : [])
    } catch (e) {
      if (e.message !== 'no_session') setError('Error al cargar pallets')
    } finally {
      setLoading(false)
    }
  }, [warehouseId])

  useEffect(() => { loadData() }, [loadData])

  if (!warehouseId) {
    return <SessionErrorState error={{ missing: 'warehouse_id' }} backTo="/entregas" />
  }

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 2800)
  }

  function openAcceptDialog(pallet) {
    setDialog({ type: 'accept', pallet })
  }

  function openRejectDialog(pallet) {
    setRejectReason('')
    setDialog({ type: 'reject', pallet })
  }

  function closeDialog() {
    setDialog(null)
    setRejectReason('')
  }

  async function handleAcceptConfirm() {
    if (!dialog || dialog.type !== 'accept') return
    const palletId = dialog.pallet.id
    closeDialog()
    setActionStates((s) => ({ ...s, [palletId]: 'accepting' }))
    try {
      await acceptPallet(palletId)
      showToast('Pallet aceptado correctamente')
      await loadData()
    } catch (e) {
      if (e.message !== 'no_session') showToast('Error al aceptar pallet', 'error')
    } finally {
      setActionStates((s) => { const n = { ...s }; delete n[palletId]; return n })
    }
  }

  async function handleRejectConfirm() {
    if (!dialog || dialog.type !== 'reject') return
    if (!rejectReason.trim()) return
    const palletId = dialog.pallet.id
    const reason = rejectReason.trim()
    closeDialog()
    setActionStates((s) => ({ ...s, [palletId]: 'rejecting' }))
    try {
      await rejectPallet(palletId, reason)
      showToast('Pallet rechazado')
      await loadData()
    } catch (e) {
      if (e.message !== 'no_session') showToast('Error al rechazar pallet', 'error')
    } finally {
      setActionStates((s) => { const n = { ...s }; delete n[palletId]; return n })
    }
  }

  function formatTime(ts) {
    if (!ts) return ''
    try {
      const d = new Date(ts)
      return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
    } catch { return '' }
  }

  return (
    <ScreenShell title="Recibir de PT" backTo="/entregas">
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes toast-in { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      `}</style>

      {/* Summary counts */}
      {!loading && (
        <div style={{
          display: 'flex', gap: 8, marginBottom: 16,
        }}>
          <div style={{
            flex: 1, padding: '10px 12px', borderRadius: TOKENS.radius.md,
            background: pending.length > 0 ? TOKENS.colors.warningSoft : TOKENS.colors.surfaceSoft,
            border: `1px solid ${pending.length > 0 ? 'rgba(245,158,11,0.2)' : TOKENS.colors.border}`,
            textAlign: 'center',
          }}>
            <p style={{ ...typo.h2, color: pending.length > 0 ? TOKENS.colors.warning : TOKENS.colors.textMuted, margin: 0 }}>{pending.length}</p>
            <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '2px 0 0' }}>Pendientes</p>
          </div>
          <div style={{
            flex: 1, padding: '10px 12px', borderRadius: TOKENS.radius.md,
            background: TOKENS.colors.successSoft,
            border: `1px solid rgba(34,197,94,0.2)`,
            textAlign: 'center',
          }}>
            <p style={{ ...typo.h2, color: TOKENS.colors.success, margin: 0 }}>{ready.length}</p>
            <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '2px 0 0' }}>Recibidos hoy</p>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{
          margin: '0 0 12px', padding: 12, borderRadius: TOKENS.radius.sm,
          background: TOKENS.colors.errorSoft, border: '1px solid rgba(239,68,68,0.2)',
        }}>
          <p style={{ ...typo.caption, color: TOKENS.colors.error, margin: 0 }}>{error}</p>
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}>
          <div style={{
            width: 32, height: 32, border: '2px solid rgba(255,255,255,0.12)',
            borderTop: `2px solid ${TOKENS.colors.blue2}`, borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }} />
        </div>
      ) : (
        <>
          {/* Pending pallets */}
          <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginTop: 4, marginBottom: 10 }}>
            PENDIENTES DE RECIBIR
          </p>

          {pending.length === 0 ? (
            <EmptyState icon="\u{2705}" message="Sin pallets pendientes" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
              {pending.map((pallet) => {
                const state = actionStates[pallet.id]
                const isBusy = !!state
                return (
                  <div key={pallet.id} style={{
                    padding: 14, borderRadius: TOKENS.radius.xl,
                    background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
                    boxShadow: TOKENS.shadow.soft, opacity: isBusy ? 0.6 : 1,
                    transition: `opacity ${TOKENS.motion.fast}`,
                  }}>
                    {/* Pallet info */}
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <p style={{ ...typo.title, color: TOKENS.colors.text, margin: 0 }}>
                          {pallet.name || pallet.display_name || `Pallet #${pallet.id}`}
                        </p>
                        {pallet.shift && (
                          <span style={{
                            padding: '2px 8px', borderRadius: TOKENS.radius.pill,
                            background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
                            fontSize: 10, fontWeight: 600, color: TOKENS.colors.textMuted,
                          }}>
                            Turno {pallet.shift}
                          </span>
                        )}
                      </div>
                      {pallet.product && (
                        <p style={{ ...typo.body, color: TOKENS.colors.textSoft, margin: '4px 0 0' }}>
                          {typeof pallet.product === 'string' ? pallet.product : (Array.isArray(pallet.product) ? pallet.product[1] : pallet.product_name || '')}
                        </p>
                      )}
                      <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
                        {(pallet.qty || pallet.quantity) && (
                          <span style={{ ...typo.caption, color: TOKENS.colors.textMuted }}>
                            Cant: {pallet.qty || pallet.quantity} {pallet.uom || 'kg'}
                          </span>
                        )}
                        {pallet.create_date && (
                          <span style={{ ...typo.caption, color: TOKENS.colors.textMuted }}>
                            {formatTime(pallet.create_date)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => openAcceptDialog(pallet)}
                        disabled={isBusy}
                        style={{
                          flex: 1, padding: '10px 0', borderRadius: TOKENS.radius.md,
                          background: 'linear-gradient(90deg, rgba(34,197,94,0.18), rgba(34,197,94,0.10))',
                          border: `1px solid rgba(34,197,94,0.35)`,
                          color: TOKENS.colors.success, fontSize: 13, fontWeight: 700,
                          cursor: isBusy ? 'default' : 'pointer',
                        }}
                      >
                        {state === 'accepting' ? 'Aceptando...' : 'Aceptar'}
                      </button>
                      <button
                        onClick={() => openRejectDialog(pallet)}
                        disabled={isBusy}
                        style={{
                          flex: 1, padding: '10px 0', borderRadius: TOKENS.radius.md,
                          background: 'linear-gradient(90deg, rgba(239,68,68,0.14), rgba(239,68,68,0.06))',
                          border: `1px solid rgba(239,68,68,0.30)`,
                          color: TOKENS.colors.error, fontSize: 13, fontWeight: 700,
                          cursor: isBusy ? 'default' : 'pointer',
                        }}
                      >
                        {state === 'rejecting' ? 'Rechazando...' : 'Rechazar'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Ready pallets */}
          <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginTop: 8, marginBottom: 10 }}>
            RECIBIDOS HOY
          </p>

          {ready.length === 0 ? (
            <EmptyState icon="\u{1F4E6}" message="Sin recepciones hoy" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {ready.map((pallet) => (
                <div key={pallet.id} style={{
                  padding: '10px 14px', borderRadius: TOKENS.radius.lg,
                  background: TOKENS.colors.surfaceSoft, border: `1px solid ${TOKENS.colors.border}`,
                  display: 'flex', alignItems: 'center', gap: 10,
                }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                    background: TOKENS.colors.successSoft, border: `1px solid rgba(34,197,94,0.25)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={TOKENS.colors.success} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ ...typo.body, color: TOKENS.colors.textSoft, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {pallet.name || pallet.display_name || `Pallet #${pallet.id}`}
                    </p>
                    <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '1px 0 0' }}>
                      {typeof pallet.product === 'string' ? pallet.product : (Array.isArray(pallet.product) ? pallet.product[1] : pallet.product_name || '')}
                      {(pallet.qty || pallet.quantity) ? ` \u2014 ${pallet.qty || pallet.quantity} ${pallet.uom || 'kg'}` : ''}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ height: 32 }} />
        </>
      )}

      {/* Accept confirm dialog */}
      {dialog?.type === 'accept' && (
        <ConfirmDialog
          title="Aceptar pallet"
          message={`Confirmar recepcion de "${dialog.pallet.name || dialog.pallet.display_name || `Pallet #${dialog.pallet.id}`}"?`}
          confirmLabel="Aceptar"
          confirmColor={TOKENS.colors.success}
          onConfirm={handleAcceptConfirm}
          onCancel={closeDialog}
        />
      )}

      {/* Reject dialog with reason input */}
      {dialog?.type === 'reject' && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 20,
        }} onClick={closeDialog}>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 380, padding: 20, borderRadius: TOKENS.radius.xl,
              background: TOKENS.colors.bg1, border: `1px solid ${TOKENS.colors.border}`,
              boxShadow: TOKENS.shadow.md,
            }}
          >
            <p style={{ ...typo.h2, color: TOKENS.colors.text, margin: '0 0 6px' }}>Rechazar pallet</p>
            <p style={{ ...typo.body, color: TOKENS.colors.textMuted, margin: '0 0 14px' }}>
              {dialog.pallet.name || dialog.pallet.display_name || `Pallet #${dialog.pallet.id}`}
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Motivo del rechazo (requerido)..."
              rows={3}
              style={{
                width: '100%', padding: 12, borderRadius: TOKENS.radius.sm,
                background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
                color: TOKENS.colors.text, fontSize: 14, fontFamily: 'inherit',
                resize: 'vertical', outline: 'none',
              }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button
                onClick={closeDialog}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: TOKENS.radius.md,
                  background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
                  color: TOKENS.colors.textMuted, fontSize: 14, fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleRejectConfirm}
                disabled={!rejectReason.trim()}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: TOKENS.radius.md,
                  background: !rejectReason.trim()
                    ? 'rgba(239,68,68,0.08)'
                    : 'linear-gradient(90deg, rgba(239,68,68,0.25), rgba(239,68,68,0.15))',
                  border: `1px solid rgba(239,68,68,0.35)`,
                  color: TOKENS.colors.error, fontSize: 14, fontWeight: 700,
                  opacity: !rejectReason.trim() ? 0.4 : 1,
                  cursor: !rejectReason.trim() ? 'default' : 'pointer',
                }}
              >
                Rechazar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
          zIndex: 1100, padding: '10px 20px', borderRadius: TOKENS.radius.pill,
          background: toast.type === 'error' ? 'rgba(239,68,68,0.92)' : 'rgba(34,197,94,0.92)',
          color: '#fff', fontSize: 13, fontWeight: 600,
          boxShadow: TOKENS.shadow.md, animation: 'toast-in 0.25s ease',
          whiteSpace: 'nowrap',
        }}>
          {toast.msg}
        </div>
      )}
    </ScreenShell>
  )
}
