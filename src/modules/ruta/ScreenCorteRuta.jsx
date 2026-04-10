// ScreenCorteRuta.jsx — V2 CRITICO: Cuadre de unidades
// Regla: inventario final DEBE ser 0. No se puede cerrar ruta con diferencias.
// Base: gf.dispatch.reconciliation (LIVE).

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../App'
import { TOKENS, getTypo } from '../../tokens'
import { getMyRoutePlan, getReconciliation, getLoadLines } from './api'
import { logScreenError } from '../shared/logScreenError'
import {
  buildInventoryView,
  validateCorte,
  saveCierreState,
  getCierreState,
  fmtNum,
} from './routeControlService'

export default function ScreenCorteRuta() {
  const { session } = useSession()
  const navigate = useNavigate()
  const [sw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])
  const [loading, setLoading] = useState(true)
  const [invView, setInvView] = useState(null)
  const [plan, setPlan] = useState(null)
  const [validation, setValidation] = useState(null)
  const [confirmed, setConfirmed] = useState(false)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const p = await getMyRoutePlan(session?.employee_id)
      setPlan(p)
      if (!p) { setInvView(null); setLoading(false); return }

      // Check if already confirmed — backend field or local cache
      const cierreState = getCierreState(p.id, p)
      if (cierreState.corteDone) setConfirmed(true)

      let reconciliation = null
      if (p.reconciliation_id) {
        try { reconciliation = await getReconciliation(p.id) } catch (e) { logScreenError('ScreenCorteRuta', 'getReconciliation', e) }
      }

      let loadLinesData = []
      if (p.load_picking_id) {
        const pickingId = Array.isArray(p.load_picking_id) ? p.load_picking_id[0] : p.load_picking_id
        try { loadLinesData = await getLoadLines(pickingId) } catch (e) { logScreenError('ScreenCorteRuta', 'getLoadLines', e) }
      }

      const iv = buildInventoryView(reconciliation, loadLinesData)
      setInvView(iv)
      setValidation(validateCorte(iv))
    } catch (e) { logScreenError('ScreenCorteRuta', 'loadData', e); setInvView(null) }
    setLoading(false)
  }

  function handleConfirmCorte() {
    if (!plan?.id) return
    saveCierreState(plan.id, { corteDone: true, corteAt: new Date().toISOString() })
    setConfirmed(true)
  }

  const lines = invView?.lines || []
  const totals = invView?.totals || {}
  const isValid = validation?.valid || false
  const errors = validation?.errors || []
  const warnings = validation?.warnings || []

  // Calculate totals for the equation display
  const totalLoaded = totals.loaded || 0
  const totalDelivered = totals.delivered || 0
  const totalReturned = totals.returned || 0
  const totalScrap = totals.scrap || 0
  const totalRemaining = totalLoaded - totalDelivered - totalReturned - totalScrap

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 20, paddingBottom: 12 }}>
          <button onClick={() => navigate('/ruta')} style={{
            width: 38, height: 38, borderRadius: TOKENS.radius.md,
            background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
            </svg>
          </button>
          <span style={{ ...typo.title, color: TOKENS.colors.textSoft }}>Corte de Unidades</span>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}>
            <div style={{ width: 32, height: 32, border: '2px solid rgba(255,255,255,0.12)', borderTop: '2px solid #2B8FE0', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : !invView || invView.source === 'empty' ? (
          <div style={{ marginTop: 40, padding: 24, borderRadius: TOKENS.radius.xl, background: TOKENS.colors.surfaceSoft, border: `1px solid ${TOKENS.colors.border}`, textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>&#x1F4CB;</div>
            <p style={{ ...typo.title, color: TOKENS.colors.text, margin: 0 }}>Sin datos para corte</p>
            <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '8px 0 0' }}>
              {!plan?.reconciliation_id
                ? 'La conciliacion se genera al registrar entregas en Kold Field.'
                : 'Sin datos de carga.'}
            </p>
          </div>
        ) : (
          <>
            {/* Equation card */}
            <div style={{
              padding: 16, borderRadius: TOKENS.radius.xl,
              background: TOKENS.glass.hero, border: `1px solid ${TOKENS.colors.borderBlue}`,
              marginBottom: 16,
            }}>
              <p style={{ ...typo.overline, color: TOKENS.colors.textLow, margin: '0 0 10px' }}>ECUACION DE CUADRE</p>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                <EqBadge label="Cargado" value={totalLoaded} color={TOKENS.colors.blue2} typo={typo} />
                <span style={{ color: TOKENS.colors.textMuted, fontWeight: 700 }}>=</span>
                <EqBadge label="Entregado" value={totalDelivered} color="#22c55e" typo={typo} />
                <span style={{ color: TOKENS.colors.textMuted, fontWeight: 700 }}>+</span>
                <EqBadge label="Devuelto" value={totalReturned} color="#f59e0b" typo={typo} />
                <span style={{ color: TOKENS.colors.textMuted, fontWeight: 700 }}>+</span>
                <EqBadge label="Merma" value={totalScrap} color="#ef4444" typo={typo} />
              </div>

              {/* Result */}
              <div style={{
                padding: '10px 14px', borderRadius: TOKENS.radius.md,
                background: totalRemaining === 0 ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                border: `1px solid ${totalRemaining === 0 ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
                textAlign: 'center',
              }}>
                <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, marginBottom: 2 }}>INVENTARIO RESTANTE</p>
                <p style={{
                  margin: 0, fontSize: 32, fontWeight: 700,
                  color: totalRemaining === 0 ? '#22c55e' : '#ef4444',
                  letterSpacing: '-0.03em',
                }}>
                  {fmtNum(totalRemaining)}
                </p>
                <p style={{ ...typo.caption, margin: '4px 0 0',
                  color: totalRemaining === 0 ? '#22c55e' : '#ef4444', fontWeight: 600,
                }}>
                  {totalRemaining === 0 ? 'CUADRA CORRECTAMENTE' : 'NO CUADRA — REVISAR'}
                </p>
              </div>
            </div>

            {/* Per-product detail */}
            <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginBottom: 8 }}>DETALLE POR PRODUCTO</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
              {lines.map((line, i) => {
                const remaining = line.remaining
                const ok = remaining === 0
                return (
                  <div key={i} style={{
                    padding: '10px 12px', borderRadius: TOKENS.radius.lg,
                    background: ok ? 'rgba(34,197,94,0.04)' : 'rgba(239,68,68,0.04)',
                    border: `1px solid ${ok ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.2)'}`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <p style={{ ...typo.caption, color: TOKENS.colors.textSoft, margin: 0, fontWeight: 600 }}>
                        {line.product}
                      </p>
                      <span style={{
                        padding: '2px 8px', borderRadius: TOKENS.radius.pill, fontSize: 10, fontWeight: 700,
                        background: ok ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                        color: ok ? '#22c55e' : '#ef4444',
                      }}>
                        {ok ? 'OK' : `${remaining > 0 ? '+' : ''}${remaining}`}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <span style={{ fontSize: 10, color: TOKENS.colors.textMuted }}>Carga: {fmtNum(line.loaded)}</span>
                      <span style={{ fontSize: 10, color: TOKENS.colors.textMuted }}>Entreg: {fmtNum(line.delivered)}</span>
                      <span style={{ fontSize: 10, color: TOKENS.colors.textMuted }}>Dev: {fmtNum(line.returned)}</span>
                      {line.scrap > 0 && <span style={{ fontSize: 10, color: TOKENS.colors.textMuted }}>Merma: {fmtNum(line.scrap)}</span>}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Validation errors */}
            {errors.length > 0 && (
              <div style={{
                padding: 12, borderRadius: TOKENS.radius.md, marginBottom: 12,
                background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
              }}>
                <p style={{ ...typo.caption, color: '#ef4444', margin: 0, fontWeight: 700, marginBottom: 4 }}>
                  No se puede confirmar corte:
                </p>
                {errors.map((e, i) => (
                  <p key={i} style={{ ...typo.caption, color: '#ef4444', margin: 0 }}>- {e}</p>
                ))}
              </div>
            )}

            {/* Warnings */}
            {warnings.length > 0 && (
              <div style={{
                padding: 12, borderRadius: TOKENS.radius.md, marginBottom: 12,
                background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)',
              }}>
                {warnings.map((w, i) => (
                  <p key={i} style={{ ...typo.caption, color: '#f59e0b', margin: 0 }}>- {w}</p>
                ))}
              </div>
            )}

            {/* Confirm button */}
            {confirmed ? (
              <div style={{
                padding: 14, borderRadius: TOKENS.radius.lg,
                background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)',
                textAlign: 'center',
              }}>
                <p style={{ ...typo.body, color: '#22c55e', margin: 0, fontWeight: 700 }}>
                  Corte confirmado
                </p>
              </div>
            ) : (
              <button
                onClick={handleConfirmCorte}
                disabled={!isValid}
                style={{
                  width: '100%', padding: '14px 0', borderRadius: TOKENS.radius.lg,
                  background: isValid ? 'linear-gradient(135deg, #15499B, #2B8FE0)' : TOKENS.colors.surface,
                  color: isValid ? 'white' : TOKENS.colors.textMuted,
                  fontWeight: 700, fontSize: 15,
                  opacity: isValid ? 1 : 0.5,
                }}
              >
                {isValid ? 'Confirmar Corte' : 'Corte no disponible (revisar diferencias)'}
              </button>
            )}

            <div style={{ height: 32 }} />
          </>
        )}
      </div>
    </div>
  )
}

function EqBadge({ label, value, color, typo }) {
  return (
    <div style={{
      padding: '4px 10px', borderRadius: TOKENS.radius.pill,
      background: `${color}15`, border: `1px solid ${color}30`,
    }}>
      <span style={{ fontSize: 10, color: TOKENS.colors.textMuted }}>{label} </span>
      <span style={{ fontSize: 13, fontWeight: 700, color }}>{fmtNum(value)}</span>
    </div>
  )
}
