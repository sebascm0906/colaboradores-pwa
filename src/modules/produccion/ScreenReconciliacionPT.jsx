// ScreenReconciliacionPT.jsx — Fase 6, hardening Fase 7/9, integracion canonico Fase 10
// Pantalla de reconciliacion de inventario: Produccion vs Almacen PT.
//
// CONTRATO CANONICO (Odoo controller real):
//   POST /api/production/pt/reconcile
//   Request:  { shift_id, plant_id?, manual: { pt_received_kg? } }
//   Response: { manual, system, differences, incidents, consistent }
//
// Backend calcula la verdad del sistema. Frontend NO recalcula.
// La pantalla solo captura input manual opcional y muestra el resultado.

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../App'
import { TOKENS, getTypo } from '../../tokens'
import { getActiveShift } from '../supervision/api'
import {
  submitReconciliation,
  getCachedReconciliation,
} from '../shared/reconciliationPT'
import { logScreenError } from '../shared/logScreenError'

export default function ScreenReconciliacionPT() {
  const { session } = useSession()
  const navigate = useNavigate()
  const [sw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])
  const [shift, setShift] = useState(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [msg, setMsg] = useState(null)
  const [reconciliation, setReconciliation] = useState(null)
  const [ptReceivedKg, setPtReceivedKg] = useState('')

  useEffect(() => { loadData() }, [])
  useEffect(() => {
    if (msg) { const t = setTimeout(() => setMsg(null), 5000); return () => clearTimeout(t) }
  }, [msg])

  async function loadData() {
    setLoading(true)
    try {
      const s = await getActiveShift()
      setShift(s)
      if (s?.id) {
        // Verificar si hay resultado cacheado
        const cached = getCachedReconciliation(s.id)
        if (cached) setReconciliation(cached)
      }
    } catch (e) {
      logScreenError('ScreenReconciliacionPT', 'loadData', e)
    } finally {
      setLoading(false)
    }
  }

  // Backend requiere manual.pt_received_kg (verificado live 2026-04-14:
  // endpoint devuelve "Debe enviar 'manual.pt_received_kg' o 'pt_received_kg'"
  // si no se envia). Contrato: input es REQUERIDO.
  const manualKgParsed = parseFloat(ptReceivedKg)
  const manualKgValid = !isNaN(manualKgParsed) && manualKgParsed >= 0
  const canSubmit = !!shift?.id && manualKgValid && !submitting

  async function handleSubmit() {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      const payload = {
        shift_id: shift.id,
        manual: { pt_received_kg: manualKgParsed },
      }
      const result = await submitReconciliation(payload)
      if (result.ok && result.data) {
        setReconciliation(result.data)
        setMsg({
          type: result.data.consistent ? 'success' : 'warning',
          text: result.data.consistent
            ? 'Inventario cuadra con el sistema.'
            : 'Diferencias detectadas por el sistema. Revisa los detalles.',
        })
      } else {
        setMsg({ type: 'error', text: result.error || 'Error al procesar' })
      }
    } catch (e) {
      setMsg({ type: 'error', text: e.message || 'Error' })
    } finally {
      setSubmitting(false)
    }
  }

  // Extraer datos del response canonico
  const sys = reconciliation?.system || {}
  const manual = reconciliation?.manual || {}
  const diffs = reconciliation?.differences || {}
  const incidents = reconciliation?.incidents || []
  const consistent = reconciliation?.consistent ?? null

  const cardStyle = {
    padding: 14, borderRadius: TOKENS.radius.xl, marginBottom: 12,
    background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
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
        input { font-family: 'DM Sans', sans-serif; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 16px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 20, paddingBottom: 16 }}>
          <button onClick={() => navigate('/produccion')} style={{
            width: 38, height: 38, borderRadius: TOKENS.radius.md,
            background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
            </svg>
          </button>
          <div style={{ flex: 1 }}>
            <span style={{ ...typo.title, color: TOKENS.colors.textSoft }}>Verificar Inventario</span>
          </div>
          {consistent !== null && (
            <span style={{
              padding: '4px 10px', borderRadius: TOKENS.radius.pill,
              background: consistent ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)',
              border: `1px solid ${consistent ? 'rgba(34,197,94,0.3)' : 'rgba(245,158,11,0.3)'}`,
              fontSize: 11, fontWeight: 700,
              color: consistent ? TOKENS.colors.success : TOKENS.colors.warning,
            }}>{consistent ? 'TODO CUADRA' : 'HAY DIFERENCIAS'}</span>
          )}
        </div>

        {/* Messages */}
        {msg && (
          <div style={{
            marginBottom: 12, padding: '10px 14px', borderRadius: TOKENS.radius.md,
            background: msg.type === 'success' ? 'rgba(34,197,94,0.12)'
              : msg.type === 'warning' ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.12)',
            border: `1px solid ${msg.type === 'success' ? 'rgba(34,197,94,0.3)'
              : msg.type === 'warning' ? 'rgba(245,158,11,0.3)' : 'rgba(239,68,68,0.3)'}`,
          }}>
            <span style={{ ...typo.caption, color: msg.type === 'success' ? TOKENS.colors.success
              : msg.type === 'warning' ? TOKENS.colors.warning : TOKENS.colors.error }}>{msg.text}</span>
          </div>
        )}

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
            <div style={{ width: 32, height: 32, border: '2px solid rgba(255,255,255,0.12)', borderTop: '2px solid #2B8FE0', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : !shift ? (
          <div style={{ ...cardStyle, textAlign: 'center', marginTop: 40 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>&#x26A0;&#xFE0F;</div>
            <p style={{ ...typo.title, color: TOKENS.colors.warning }}>Sin turno activo</p>
            <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, marginTop: 6 }}>Abre un turno primero.</p>
          </div>
        ) : (
          <>
            {/* Explicacion para el almacenista */}
            {!reconciliation && (
              <div style={{ ...cardStyle, background: 'rgba(43,143,224,0.06)', border: '1px solid rgba(43,143,224,0.2)' }}>
                <p style={{ ...typo.body, color: TOKENS.colors.textSoft, margin: 0 }}>
                  Ingresa los kilos que recibiste de produccion. El sistema compara contra lo registrado y te dice si cuadra.
                </p>
              </div>
            )}

            {/* Datos del sistema (backend) */}
            {reconciliation && (
              <>
                <div style={cardStyle}>
                  <p style={{ ...typo.overline, color: TOKENS.colors.textLow, margin: '0 0 10px' }}>LO QUE DICE EL SISTEMA</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <MetricCard label="Produccion del turno" value={fmtKg(sys.production_kg)} typo={typo} />
                    <MetricCard label="Empacado del turno" value={fmtKg(sys.packed_kg)} typo={typo} />
                    <MetricCard label="Merma" value={fmtKg(sys.scrap_kg)} typo={typo} />
                    <MetricCard label="Inventario en almacen" value={fmtKg(sys.inventory_pt_kg)} typo={typo} highlight />
                  </div>
                </div>

                {/* Datos manuales */}
                {manual && Object.keys(manual).length > 0 && (
                  <div style={cardStyle}>
                    <p style={{ ...typo.overline, color: TOKENS.colors.textLow, margin: '0 0 10px' }}>LO QUE TU REPORTASTE</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <MetricCard label="PT recibido" value={fmtKg(manual.pt_received_kg)} typo={typo} />
                    </div>
                  </div>
                )}

                {/* Diferencias */}
                {diffs && Object.keys(diffs).length > 0 && (
                  <div style={{
                    ...cardStyle,
                    background: consistent ? 'rgba(34,197,94,0.06)' : 'rgba(245,158,11,0.06)',
                    border: `1px solid ${consistent ? 'rgba(34,197,94,0.2)' : 'rgba(245,158,11,0.25)'}`,
                  }}>
                    <p style={{ ...typo.overline, color: TOKENS.colors.textLow, margin: '0 0 8px' }}>DIFERENCIAS</p>
                    {Object.entries(diffs).map(([key, val]) => {
                      const sev = severityForDiff(key, incidents)
                      const color = colorForSeverity(sev, TOKENS)
                      return (
                        <div key={key} style={{
                          display: 'flex', justifyContent: 'space-between', padding: '6px 0',
                          borderBottom: `1px solid ${TOKENS.colors.border}`,
                        }}>
                          <span style={{ ...typo.caption, color: TOKENS.colors.textMuted }}>{formatDiffLabel(key)}</span>
                          <span style={{ ...typo.body, fontWeight: 700, color }}>
                            {typeof val === 'number' ? `${val.toFixed(1)} kg` : String(val)}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Guia de accion cuando hay diferencias */}
                {consistent === false && (
                  <div style={{
                    ...cardStyle,
                    background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)',
                  }}>
                    <p style={{ ...typo.body, color: TOKENS.colors.warning, margin: 0, fontWeight: 700 }}>
                      Hay diferencias en el inventario
                    </p>
                    <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '6px 0 0' }}>
                      Notifica a tu supervisor para que revisen juntos las diferencias.
                    </p>
                  </div>
                )}

                {/* Incidencias (backend) */}
                {incidents.length > 0 && (
                  <div style={cardStyle}>
                    <p style={{ ...typo.overline, color: TOKENS.colors.error, margin: '0 0 8px' }}>
                      INCIDENCIAS ({incidents.length})
                    </p>
                    {incidents.map((inc, i) => {
                      const sev = inc?.severity
                      const sevColor = sev === 'high' ? TOKENS.colors.error
                        : sev === 'medium' ? TOKENS.colors.warning : TOKENS.colors.textMuted
                      const sevLabel = sev === 'high' ? 'ALTA'
                        : sev === 'medium' ? 'MEDIA' : sev ? String(sev).toUpperCase() : null
                      return (
                        <div key={inc?.code || i} style={{
                          padding: '10px 0',
                          borderTop: i > 0 ? `1px solid ${TOKENS.colors.border}` : 'none',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            {sevLabel && (
                              <span style={{
                                padding: '2px 8px', borderRadius: TOKENS.radius.pill,
                                background: sev === 'high' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
                                border: `1px solid ${sevColor}`,
                                fontSize: 10, fontWeight: 700, color: sevColor,
                              }}>{sevLabel}</span>
                            )}
                            <span style={{ ...typo.caption, color: TOKENS.colors.textLow, fontSize: 10 }}>
                              {inc?.code || ''}
                            </span>
                          </div>
                          <p style={{ ...typo.caption, color: TOKENS.colors.text, margin: 0 }}>
                            {inc?.message || inc?.name || inc?.title || `Incidencia ${i + 1}`}
                          </p>
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            )}

            {/* Input manual + Submit */}
            <div style={cardStyle}>
              <p style={{ ...typo.overline, color: TOKENS.colors.textLow, margin: '0 0 10px' }}>
                {reconciliation ? 'ACTUALIZAR DATO' : 'DATO MANUAL (REQUERIDO)'}
              </p>
              <div style={{ marginBottom: 12 }}>
                <label style={{ ...typo.caption, color: TOKENS.colors.textMuted, display: 'block', marginBottom: 4 }}>
                  Kilos recibidos de produccion *
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  min="0"
                  value={ptReceivedKg}
                  onChange={e => setPtReceivedKg(e.target.value)}
                  placeholder="Ej: 1250.5"
                  style={{
                    width: '100%', padding: '10px 12px', borderRadius: TOKENS.radius.sm,
                    background: TOKENS.colors.surface,
                    border: `1px solid ${ptReceivedKg && !manualKgValid ? TOKENS.colors.error : TOKENS.colors.border}`,
                    color: TOKENS.colors.text, fontSize: 14, outline: 'none',
                  }}
                />
                {ptReceivedKg && !manualKgValid && (
                  <p style={{ ...typo.caption, color: TOKENS.colors.error, margin: '4px 0 0' }}>
                    Ingresa un numero valido (>= 0)
                  </p>
                )}
              </div>

              <div style={{ textAlign: 'center' }}>
                <button onClick={handleSubmit} disabled={!canSubmit}
                  style={{
                    width: '100%', padding: '12px', borderRadius: TOKENS.radius.sm, fontSize: 14, fontWeight: 600,
                    color: 'white',
                    background: 'linear-gradient(135deg, #15499B 0%, #2B8FE0 100%)',
                    border: '1px solid transparent',
                    opacity: canSubmit ? 1 : 0.5,
                    cursor: canSubmit ? 'pointer' : 'not-allowed',
                  }}>
                  {submitting ? 'Consultando...' : reconciliation ? 'Verificar de nuevo' : 'Verificar inventario'}
                </button>
              </div>
            </div>
          </>
        )}
        <div style={{ height: 32 }} />
      </div>
    </div>
  )
}

function MetricCard({ label, value, typo, highlight }) {
  return (
    <div style={{
      padding: '8px 10px', borderRadius: TOKENS.radius.sm,
      background: highlight ? 'rgba(43,143,224,0.08)' : 'rgba(255,255,255,0.03)',
      border: `1px solid ${highlight ? 'rgba(43,143,224,0.25)' : TOKENS.colors.border}`,
    }}>
      <p style={{ ...typo.overline, color: TOKENS.colors.textLow, margin: 0 }}>{label}</p>
      <p style={{
        ...typo.title, margin: '2px 0 0',
        color: highlight ? TOKENS.colors.blue2 : TOKENS.colors.text,
      }}>{value}</p>
    </div>
  )
}

function fmtKg(val) {
  if (val == null) return '—'
  return `${Number(val).toFixed(1)} kg`
}

function formatDiffLabel(key) {
  const labels = {
    manual_pt_received_vs_system_pt_received_kg: 'PT recibido (tu vs sistema)',
    packed_vs_pt_received_kg: 'Empacado vs PT recibido',
    production_vs_accounted_kg: 'Producido vs contabilizado',
    pt_received_vs_inventory_kg: 'PT recibido vs inventario',
  }
  return labels[key] || key.replace(/_/g, ' ')
}

// Mapeo codigo de incidencia -> key de diferencia (contrato backend)
const INCIDENT_TO_DIFF = {
  manual_pt_received_vs_system_pt_received_mismatch: 'manual_pt_received_vs_system_pt_received_kg',
  packed_vs_pt_received_mismatch: 'packed_vs_pt_received_kg',
  production_vs_accounted_mismatch: 'production_vs_accounted_kg',
  pt_received_vs_inventory_mismatch: 'pt_received_vs_inventory_kg',
}

function severityForDiff(diffKey, incidents) {
  if (!Array.isArray(incidents)) return null
  for (const inc of incidents) {
    if (INCIDENT_TO_DIFF[inc?.code] === diffKey) return inc.severity || null
  }
  return null
}

function colorForSeverity(severity, tokens) {
  if (severity === 'high') return tokens.colors.error
  if (severity === 'medium') return tokens.colors.warning
  return tokens.colors.success
}
