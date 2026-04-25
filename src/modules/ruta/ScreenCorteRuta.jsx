// ScreenCorteRuta.jsx — V2 CRITICO: Cuadre de unidades
// Regla: inventario final DEBE ser 0. No se puede cerrar ruta con diferencias.
// Base: gf.dispatch.reconciliation (LIVE).

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../App'
import { TOKENS, getTypo } from '../../tokens'
import { getMyRoutePlan, getReconciliation, getLoadLines, validateCorte } from './api'
import { logScreenError } from '../shared/logScreenError'
import {
  buildInventoryView,
  validateCorte as validateCorteLocal,
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
  // Estado del submit al backend de validate-corte
  const [submitting, setSubmitting] = useState(false)
  // Banner de feedback tras el call al backend
  // {kind:'success'|'mismatch'|'error', message:string, details?:object} | null
  const [backendNote, setBackendNote] = useState(null)
  // Marca server-side: solo true cuando backend devolvió data.corte_validated
  const [serverConfirmed, setServerConfirmed] = useState(false)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const p = await getMyRoutePlan(session?.employee_id)
      setPlan(p)
      if (!p) { setInvView(null); setLoading(false); return }

      // Check if already confirmed — preferimos campo backend (corte_validated)
      // sobre el cache de localStorage. Si el plan ya viene con
      // corte_validated:true desde Odoo, marcamos como confirmed server-side.
      const cierreState = getCierreState(p.id, p)
      if (p.corte_validated === true) {
        setConfirmed(true)
        setServerConfirmed(true)
      } else if (cierreState.corteDone) {
        // Cache local heredado de versiones previas; lo mostramos como
        // confirmado para no perder progreso UX, pero NO marcamos
        // serverConfirmed (el cierre final de ruta validará server-side).
        setConfirmed(true)
      }

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
      setValidation(validateCorteLocal(iv))
    } catch (e) { logScreenError('ScreenCorteRuta', 'loadData', e); setInvView(null) }
    setLoading(false)
  }

  /**
   * Llama POST /pwa-ruta/validate-corte. Backend recalcula la conciliación
   * con _ensure_reconciliation(recompute=True) y decide si el cuadre = 0.
   * client_validation se envía como hint de telemetría (no decide).
   *
   * Casos manejados:
   *   res.ok === true  + data.corte_validated === true → marca server-confirmed
   *   res.ok === false + code === 'corte_validation_failed' → muestra detalles
   *   res.ok === false (sin code) → ownership/acceso, mensaje del backend
   *   network error / 404 / 5xx → error genérico, NO marca corteDone
   *
   * En NINGÚN caso usamos localStorage como fuente de verdad para "validó
   * server-side". Solo usamos saveCierreState como cache UX cuando el
   * backend confirmó explícitamente — y serverConfirmed=true es la marca
   * que dice "esto vino del backend".
   */
  async function handleConfirmCorte() {
    if (!plan?.id || submitting) return
    setSubmitting(true)
    setBackendNote(null)
    const ENDPOINT = '/pwa-ruta/validate-corte'

    // client_validation es informativo: ayuda al backend a comparar con su
    // propio recálculo. No decide el resultado.
    const clientValidation = validation
      ? { valid: !!validation.valid, errors: validation.errors || [], warnings: validation.warnings || [] }
      : { valid: false, errors: [], warnings: [] }

    try {
      const res = await validateCorte(plan.id, clientValidation, '')
      const data = res?.data ?? {}

      // Caso 1: backend confirmó cuadre OK
      if (res?.ok === true && data?.corte_validated === true) {
        // Cache UI para que el hub muestre el step como done sin esperar refetch.
        // El campo `serverConfirmed` es el flag honesto: solo true cuando backend
        // confirmó explícitamente.
        saveCierreState(plan.id, {
          corteDone: true,
          corteAt: data?.corte_validated_at || new Date().toISOString(),
        })
        setConfirmed(true)
        setServerConfirmed(true)
        setBackendNote({
          kind: 'success',
          message: res?.message || 'Corte validado por backend',
          details: data?.totals || null,
        })
        return
      }

      // Caso 2: error funcional con detalles (no cuadra)
      if (res?.ok === false && res?.code === 'corte_validation_failed') {
        const det = res?.details || {}
        setBackendNote({
          kind: 'mismatch',
          message: res?.message || 'El corte no cuadra a cero',
          details: {
            totals: det.totals || null,
            errors: Array.isArray(det.errors) ? det.errors : [],
            warnings: Array.isArray(det.warnings) ? det.warnings : [],
          },
        })
        return
      }

      // Caso 3: cualquier otra forma de ok:false (acceso, plan no encontrado)
      // o respuesta sin shape esperado (404 con HTML, body vacío).
      const err = new Error(`Endpoint ${ENDPOINT} no validó el corte`)
      err.context = {
        plan_id: plan.id,
        employee_id: session?.employee_id,
        status: res?.status ?? res?.case ?? null,
        body: JSON.stringify(res ?? null).slice(0, 500),
      }
      logScreenError('ScreenCorteRuta', 'handleConfirmCorte.invalidResponse', err)
      setBackendNote({
        kind: 'error',
        message: res?.message || 'No se pudo validar el corte. Intenta de nuevo o reporta a soporte.',
      })
    } catch (e) {
      // Network error, 404 con HTML, 5xx, JSON parse error.
      e.context = {
        plan_id: plan.id,
        employee_id: session?.employee_id,
        endpoint: ENDPOINT,
      }
      logScreenError('ScreenCorteRuta', 'handleConfirmCorte.networkError', e)
      setBackendNote({
        kind: 'error',
        message: 'No se pudo validar el corte. Intenta de nuevo o reporta a soporte.',
      })
    } finally {
      setSubmitting(false)
    }
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

            {/* Banner de respuesta backend (success / mismatch / error) */}
            {backendNote && (
              <div style={{
                padding: 12, borderRadius: TOKENS.radius.md, marginBottom: 12,
                background:
                  backendNote.kind === 'success' ? 'rgba(34,197,94,0.10)'
                  : backendNote.kind === 'mismatch' ? 'rgba(245,158,11,0.10)'
                  : 'rgba(239,68,68,0.10)',
                border: `1px solid ${
                  backendNote.kind === 'success' ? 'rgba(34,197,94,0.30)'
                  : backendNote.kind === 'mismatch' ? 'rgba(245,158,11,0.30)'
                  : 'rgba(239,68,68,0.30)'}`,
              }}>
                <p style={{
                  ...typo.caption, margin: 0, fontWeight: 700,
                  color:
                    backendNote.kind === 'success' ? '#22c55e'
                    : backendNote.kind === 'mismatch' ? '#f59e0b'
                    : '#ef4444',
                }}>{backendNote.message}</p>
                {/* Detalles del mismatch — diferencia + errors/warnings */}
                {backendNote.kind === 'mismatch' && backendNote.details && (
                  <>
                    {backendNote.details.totals && (
                      <p style={{ ...typo.caption, color: '#f59e0b', margin: '6px 0 0' }}>
                        Diferencia: {fmtNum(backendNote.details.totals.difference || 0)} unidades
                      </p>
                    )}
                    {(backendNote.details.errors || []).map((e, i) => (
                      <p key={i} style={{ ...typo.caption, color: '#f59e0b', margin: '2px 0 0' }}>- {e}</p>
                    ))}
                    {(backendNote.details.warnings || []).map((w, i) => (
                      <p key={i} style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '2px 0 0' }}>- {w}</p>
                    ))}
                  </>
                )}
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
                  {serverConfirmed ? 'Corte validado por backend' : 'Validación local OK'}
                </p>
                <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '6px 0 0' }}>
                  {serverConfirmed
                    ? 'corte_validated registrado en Odoo.'
                    : 'Validación local solamente. El backend re-valida al cerrar la ruta.'}
                </p>
              </div>
            ) : (
              <button
                onClick={handleConfirmCorte}
                disabled={!isValid || submitting}
                style={{
                  width: '100%', padding: '14px 0', borderRadius: TOKENS.radius.lg,
                  background: isValid ? 'linear-gradient(135deg, #15499B, #2B8FE0)' : TOKENS.colors.surface,
                  color: isValid ? 'white' : TOKENS.colors.textMuted,
                  fontWeight: 700, fontSize: 15,
                  opacity: (isValid && !submitting) ? 1 : 0.5,
                }}
              >
                {submitting
                  ? 'Validando con backend…'
                  : isValid
                    ? 'Validar corte'
                    : 'Corte no disponible (revisar diferencias)'}
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
