// ScreenCierreRuta.jsx — V2 Cierre obligatorio de ruta
// KM final + resumen del dia + validaciones + CERRAR RUTA.
// Backend: POST /pwa-ruta/close-route con validacion server-side (gf_logistics_ops)
// Reglas: no cierra sin corte, no cierra sin liquidacion, no cierra sin KM.

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../App'
import { TOKENS, getTypo } from '../../tokens'
import { getMyRoutePlan, getMyTarget, getReconciliation, getLoadLines } from './api'
import { logScreenError } from '../shared/logScreenError'
import {
  getKmData,
  saveKmSalida,
  saveKmLlegada,
  getCierreState,
  saveCierreState,
  getProgressPct,
  getTargetProgress,
  buildInventoryView,
  validateCierre,
  closeRouteWithValidation,
  fmtNum,
  fmtPct,
  fmtMoney,
} from './routeControlService'

export default function ScreenCierreRuta() {
  const { session } = useSession()
  const navigate = useNavigate()
  const [sw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])
  const [loading, setLoading] = useState(true)
  const [plan, setPlan] = useState(null)
  const [target, setTarget] = useState(null)
  const [invView, setInvView] = useState(null)
  const [kmSalida, setKmSalida] = useState('')
  const [kmLlegada, setKmLlegada] = useState('')
  const [cierreState, setCierreState] = useState({})
  const [validation, setValidation] = useState(null)
  const [closing, setClosing] = useState(false)
  const [closed, setClosed] = useState(false)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [p, t] = await Promise.allSettled([
        getMyRoutePlan(session?.employee_id),
        getMyTarget(session?.employee_id),
      ])
      const planData = p.status === 'fulfilled' ? p.value : null
      const targetData = t.status === 'fulfilled' ? t.value : null
      setPlan(planData)
      setTarget(targetData)

      if (planData?.id) {
        // Load KM data — backend fields first, localStorage cache as fallback
        const km = getKmData(planData.id, planData)
        if (km.kmSalida) setKmSalida(km.kmSalida.toString())
        if (km.kmLlegada) setKmLlegada(km.kmLlegada.toString())

        // Load cierre state — merges backend plan fields with local cache
        const cs = getCierreState(planData.id, planData)
        setCierreState(cs)

        if (planData.state === 'closed' || planData.state === 'reconciled') {
          setClosed(true)
        }

        // Load inventory for validation
        let reconciliation = null
        if (planData.reconciliation_id) {
          try { reconciliation = await getReconciliation(planData.id) } catch (e) { logScreenError('ScreenCierreRuta', 'getReconciliation', e) }
        }
        let loadLinesData = []
        if (planData.load_picking_id) {
          const pickingId = Array.isArray(planData.load_picking_id) ? planData.load_picking_id[0] : planData.load_picking_id
          try { loadLinesData = await getLoadLines(pickingId) } catch (e) { logScreenError('ScreenCierreRuta', 'getLoadLines', e) }
        }
        const iv = buildInventoryView(reconciliation, loadLinesData)
        setInvView(iv)
      }
    } catch (e) { logScreenError('ScreenCierreRuta', 'loadData', e) }
    setLoading(false)
  }

  // Save KM when changed
  function handleKmSalidaSave() {
    if (!plan?.id || !kmSalida) return
    saveKmSalida(plan.id, parseFloat(kmSalida))
  }

  function handleKmLlegadaSave() {
    if (!plan?.id || !kmLlegada) return
    saveKmLlegada(plan.id, parseFloat(kmLlegada))
  }

  // Run validation
  useEffect(() => {
    if (plan?.id && invView) {
      const km = {
        kmSalida: parseFloat(kmSalida) || null,
        kmLlegada: parseFloat(kmLlegada) || null,
      }
      const cs = getCierreState(plan.id, plan)
      setCierreState(cs)
      setValidation(validateCierre(plan, km, cs, invView))
    }
  }, [kmSalida, kmLlegada, plan, invView])

  const [closeError, setCloseError] = useState('')

  async function handleCerrarRuta() {
    if (!plan?.id || !validation?.valid) return
    setClosing(true)
    setCloseError('')
    const depKm = parseFloat(kmSalida) || 0
    const arrKm = parseFloat(kmLlegada) || 0

    const result = await closeRouteWithValidation(plan.id, depKm, arrKm)

    if (result.success) {
      setClosed(true)
    } else if (result.source === 'backend') {
      // Server-side business error (JSON-RPC exception from Odoo) — show to user
      setCloseError(result.errors?.join('. ') || 'Error del servidor')
    } else {
      // Network error — do local close as last resort
      saveCierreState(plan.id, {
        closed: true,
        closedAt: new Date().toISOString(),
        kmSalida: depKm,
        kmLlegada: arrKm,
        kmRecorridos: arrKm - depKm,
      })
      setClosed(true)
    }
    setClosing(false)
  }

  const progressPct = getProgressPct(plan)
  const targetProgress = getTargetProgress(target)
  const errors = validation?.errors || []
  const isValid = validation?.valid || false
  const kmRecorridos = validation?.kmRecorridos || 0

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
        input { font-family: 'DM Sans', sans-serif; }
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
          <span style={{ ...typo.title, color: TOKENS.colors.textSoft }}>Cierre de Ruta</span>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}>
            <div style={{ width: 32, height: 32, border: '2px solid rgba(255,255,255,0.12)', borderTop: '2px solid #2B8FE0', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : !plan ? (
          <div style={{ marginTop: 40, padding: 24, borderRadius: TOKENS.radius.xl, background: TOKENS.colors.surfaceSoft, border: `1px solid ${TOKENS.colors.border}`, textAlign: 'center' }}>
            <p style={{ ...typo.body, color: TOKENS.colors.textMuted, margin: 0 }}>Sin ruta activa</p>
          </div>
        ) : closed ? (
          /* Closed state */
          <div style={{ marginTop: 10 }}>
            <div style={{
              padding: 24, borderRadius: TOKENS.radius.xl,
              background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)',
              textAlign: 'center', marginBottom: 20,
            }}>
              <div style={{ fontSize: 48, marginBottom: 8 }}>&#x2705;</div>
              <p style={{ ...typo.h2, color: '#22c55e', margin: 0 }}>Ruta Cerrada</p>
              <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '8px 0 0' }}>
                {plan.name || 'Ruta del dia'}
              </p>
            </div>

            {/* Day summary */}
            <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginBottom: 8 }}>RESUMEN DEL DIA</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
              <SummaryItem label="Paradas" value={`${plan.stops_done || 0}/${plan.stops_total || 0} (${fmtPct(progressPct)})`} typo={typo} />
              <SummaryItem label="Venta vs meta" value={fmtPct(targetProgress.salesPct)} typo={typo}
                valueColor={targetProgress.salesPct >= 80 ? '#22c55e' : '#f59e0b'} />
              <SummaryItem label="Cobranza vs meta" value={fmtPct(targetProgress.collectionPct)} typo={typo}
                valueColor={targetProgress.collectionPct >= 80 ? '#22c55e' : '#f59e0b'} />
              <SummaryItem label="KM salida" value={fmtNum(parseFloat(kmSalida) || 0)} typo={typo} />
              <SummaryItem label="KM llegada" value={fmtNum(parseFloat(kmLlegada) || 0)} typo={typo} />
              <SummaryItem label="KM recorridos" value={fmtNum(kmRecorridos)} typo={typo} valueColor="#2B8FE0" />
            </div>

            <button onClick={() => navigate('/ruta')} style={{
              width: '100%', padding: '14px 0', borderRadius: TOKENS.radius.lg,
              background: 'linear-gradient(135deg, #15499B, #2B8FE0)', color: 'white',
              fontWeight: 700, fontSize: 15,
            }}>
              Volver al inicio
            </button>
          </div>
        ) : (
          <>
            {/* KM Section */}
            <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginBottom: 8 }}>KILOMETRAJE</p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <div style={{ flex: 1 }}>
                <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '0 0 4px', fontSize: 10 }}>KM Salida</p>
                <input
                  type="number"
                  inputMode="numeric"
                  value={kmSalida}
                  onChange={e => setKmSalida(e.target.value)}
                  onBlur={handleKmSalidaSave}
                  placeholder="Ej: 45000"
                  style={{
                    width: '100%', padding: '10px 12px', borderRadius: TOKENS.radius.md,
                    background: 'rgba(255,255,255,0.05)', border: `1px solid ${TOKENS.colors.border}`,
                    color: 'white', fontSize: 16, fontWeight: 600, outline: 'none',
                  }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '0 0 4px', fontSize: 10 }}>KM Llegada</p>
                <input
                  type="number"
                  inputMode="numeric"
                  value={kmLlegada}
                  onChange={e => setKmLlegada(e.target.value)}
                  onBlur={handleKmLlegadaSave}
                  placeholder="Ej: 45120"
                  style={{
                    width: '100%', padding: '10px 12px', borderRadius: TOKENS.radius.md,
                    background: 'rgba(255,255,255,0.05)', border: `1px solid ${TOKENS.colors.border}`,
                    color: 'white', fontSize: 16, fontWeight: 600, outline: 'none',
                  }}
                />
              </div>
            </div>
            {kmSalida && kmLlegada && (
              <div style={{
                padding: '8px 12px', borderRadius: TOKENS.radius.md, marginBottom: 16,
                background: 'rgba(43,143,224,0.06)', border: '1px solid rgba(43,143,224,0.2)',
                textAlign: 'center',
              }}>
                <span style={{ ...typo.caption, color: TOKENS.colors.textMuted }}>KM recorridos: </span>
                <span style={{ fontSize: 15, fontWeight: 700, color: '#2B8FE0' }}>{fmtNum(kmRecorridos)}</span>
              </div>
            )}

            {/* Day summary */}
            <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginBottom: 8 }}>RESUMEN DEL DIA</p>
            <div style={{
              padding: 14, borderRadius: TOKENS.radius.lg,
              background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
              marginBottom: 16,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ ...typo.caption, color: TOKENS.colors.textMuted }}>Paradas completadas</span>
                <span style={{ ...typo.body, color: TOKENS.colors.text, fontWeight: 600 }}>
                  {plan.stops_done || 0}/{plan.stops_total || 0} ({fmtPct(progressPct)})
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ ...typo.caption, color: TOKENS.colors.textMuted }}>Cumplimiento venta</span>
                <span style={{ ...typo.body, fontWeight: 600,
                  color: targetProgress.salesPct >= 80 ? '#22c55e' : targetProgress.salesPct >= 50 ? '#f59e0b' : '#ef4444',
                }}>{fmtPct(targetProgress.salesPct)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ ...typo.caption, color: TOKENS.colors.textMuted }}>Cumplimiento cobranza</span>
                <span style={{ ...typo.body, fontWeight: 600,
                  color: targetProgress.collectionPct >= 80 ? '#22c55e' : targetProgress.collectionPct >= 50 ? '#f59e0b' : '#ef4444',
                }}>{fmtPct(targetProgress.collectionPct)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ ...typo.caption, color: TOKENS.colors.textMuted }}>Corte unidades</span>
                <span style={{ ...typo.body, fontWeight: 600,
                  color: cierreState.corteDone ? '#22c55e' : '#ef4444',
                }}>{cierreState.corteDone ? 'OK' : 'PENDIENTE'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                <span style={{ ...typo.caption, color: TOKENS.colors.textMuted }}>Liquidacion</span>
                <span style={{ ...typo.body, fontWeight: 600,
                  color: cierreState.liquidacionDone ? '#22c55e' : '#ef4444',
                }}>{cierreState.liquidacionDone ? 'OK' : 'PENDIENTE'}</span>
              </div>
            </div>

            {/* Validation errors */}
            {errors.length > 0 && (
              <div style={{
                padding: 12, borderRadius: TOKENS.radius.md, marginBottom: 16,
                background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
              }}>
                <p style={{ ...typo.caption, color: '#ef4444', margin: 0, fontWeight: 700, marginBottom: 4 }}>
                  No se puede cerrar ruta:
                </p>
                {errors.map((e, i) => (
                  <p key={i} style={{ ...typo.caption, color: '#ef4444', margin: '2px 0 0' }}>- {e}</p>
                ))}
              </div>
            )}

            {/* Server-side close error */}
            {closeError && (
              <div style={{
                padding: 12, borderRadius: TOKENS.radius.md, marginBottom: 12,
                background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
              }}>
                <p style={{ ...typo.caption, color: '#ef4444', margin: 0, fontWeight: 700, marginBottom: 4 }}>
                  Error del servidor:
                </p>
                <p style={{ ...typo.caption, color: '#ef4444', margin: 0 }}>{closeError}</p>
              </div>
            )}

            {/* Close button */}
            <button
              onClick={handleCerrarRuta}
              disabled={!isValid || closing}
              style={{
                width: '100%', padding: '16px 0', borderRadius: TOKENS.radius.lg,
                background: isValid ? 'linear-gradient(135deg, #15803d, #22c55e)' : TOKENS.colors.surface,
                color: isValid ? 'white' : TOKENS.colors.textMuted,
                fontWeight: 700, fontSize: 16,
                opacity: isValid ? 1 : 0.5,
              }}
            >
              {closing ? 'Cerrando...' : isValid ? 'CERRAR RUTA' : 'Completa los requisitos para cerrar'}
            </button>

            <div style={{ height: 32 }} />
          </>
        )}
      </div>
    </div>
  )
}

function SummaryItem({ label, value, typo, valueColor }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '8px 12px', borderRadius: TOKENS.radius.md,
      background: TOKENS.glass.panelSoft, border: `1px solid ${TOKENS.colors.border}`,
    }}>
      <span style={{ ...typo.caption, color: TOKENS.colors.textMuted }}>{label}</span>
      <span style={{ ...typo.body, fontWeight: 600, color: valueColor || TOKENS.colors.text }}>{value}</span>
    </div>
  )
}
