// ScreenHandoverTurno.jsx — Entrega estructurada de turno (Produccion)
// Hardening Fase 7.
//
// ESTADO DEL BACKEND: modelo gf.shift.handover NO EXISTE en Odoo.
// Endpoint /api/production/handover NO EXISTE.
// TODA la persistencia es LOCAL (localStorage). NO es registro oficial.
// Cuando Sebastian cree el modelo + endpoint, submitHandover() conectara
// automaticamente sin cambios en esta pantalla.
//
// No confundir con ScreenHandoverPT (Almacen PT) — aquel es para entrega
// entre almacenistas y SI tiene backend real.

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../App'
import { TOKENS, getTypo } from '../../tokens'
import { getActiveShift } from '../supervision/api'
import { resolveSupervisionWarehouseId } from '../supervision/shiftContext'
import { loadShiftReadiness } from '../shared/shiftReadiness'
import {
  getHandoverLocal,
  saveHandoverLocal,
  submitHandover,
} from '../shared/handoverLocalStore'
import { computePackingCoherence, getCoherenceHeadline } from '../shared/packingCoherence'
import {
  loadIncidents, getOpenIncidents, INCIDENT_STATES, INCIDENT_SEVERITIES,
  getIncidentTypeLabel,
} from '../shared/incidentService'
import { logScreenError } from '../shared/logScreenError'

const INITIAL_FORM = {
  incidents: '',
  pending_tasks: '',
  signature_from: '',
  signature_to: '',
  notes: '',
}

export default function ScreenHandoverTurno() {
  const { session } = useSession()
  const navigate = useNavigate()
  const [sw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])
  const supervisionWarehouseId = resolveSupervisionWarehouseId(session)
  const [shift, setShift] = useState(null)
  const [snapshot, setSnapshot] = useState(null)
  const [form, setForm] = useState(INITIAL_FORM)
  const [loading, setLoading] = useState(true)
  const [signed, setSigned] = useState(false)
  const [signedAt, setSignedAt] = useState(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)
  const [structuredIncidents, setStructuredIncidents] = useState([])

  useEffect(() => { loadData() }, [])
  useEffect(() => {
    if (msg) {
      const t = setTimeout(() => setMsg(null), 3500)
      return () => clearTimeout(t)
    }
  }, [msg])

  async function loadData() {
    setLoading(true)
    try {
      const s = await getActiveShift(supervisionWarehouseId)
      setShift(s)
      if (s?.id) {
        const [{ snapshot: snap }, incs] = await Promise.all([
          loadShiftReadiness(s.id),
          loadIncidents(s.id),
        ])
        setSnapshot(snap)
        setStructuredIncidents(incs)
        // Precarga de handover local si existe
        const prev = getHandoverLocal(s.id)
        if (prev) {
          setForm({
            incidents: prev.incidents || '',
            pending_tasks: prev.pending_tasks || '',
            signature_from: prev.signature_from || (session?.employee_name || session?.name || ''),
            signature_to: prev.signature_to || '',
            notes: prev.notes || '',
          })
          if (prev.signed) {
            setSigned(true)
            setSignedAt(prev.signed_at || null)
          }
        } else {
          setForm(f => ({
            ...f,
            signature_from: session?.employee_name || session?.name || '',
          }))
        }
      }
    } catch (e) {
      logScreenError('ScreenHandoverTurno', 'loadData', e)
    } finally {
      setLoading(false)
    }
  }

  // Totales y resumen desde snapshot
  const totals = snapshot?.totals || { producedKg: 0, mermaKg: 0, packedKg: 0 }
  const cyclesCount = (snapshot?.cycles || []).filter(c => c.state === 'dumped').length
  const downtimesCount = (snapshot?.downtimes || []).length
  const openDowntimes = (snapshot?.downtimes || []).filter(d => d.state === 'open').length

  // Coherencia empaque-produccion + mensajes UX (Fase 3)
  const coherence = useMemo(
    () => computePackingCoherence(snapshot?.cycles || [], snapshot?.packing || []),
    [snapshot]
  )
  const coherenceMsg = useMemo(() => getCoherenceHeadline(coherence), [coherence])

  const openIncidentCount = useMemo(() => getOpenIncidents(structuredIncidents).length, [structuredIncidents])

  // Diferencia general producido vs empacado (para mensaje simple)
  const diffKg = Math.max(0, (totals.producedKg || 0) - (totals.packedKg || 0))
  const diffPct = totals.producedKg > 0 ? (diffKg / totals.producedKg) * 100 : 0
  const bigDiff = diffPct > 10 && diffKg > 20  // umbral aviso UX

  // Inventario snapshot: tanques/ciclos en curso al cierre
  const inventorySnapshot = useMemo(() => {
    if (!snapshot) return []
    const pendingCycles = (snapshot.cycles || [])
      .filter(c => c.state && c.state !== 'dumped')
      .map(c => ({
        ref: `Ciclo #${c.cycle_number || c.id}`,
        detail: `${c.state}${c.kg_dumped ? ` · ${c.kg_dumped} kg` : ''}`,
      }))
    return pendingCycles
  }, [snapshot])

  const canSave = useMemo(() => {
    return !!form.signature_from.trim() && !!form.signature_to.trim()
  }, [form])

  async function handleSaveDraft() {
    if (!shift?.id) return
    setSaving(true)
    try {
      saveHandoverLocal(shift.id, {
        incidents: form.incidents,
        pending_tasks: form.pending_tasks,
        signature_from: form.signature_from,
        signature_to: form.signature_to,
        notes: form.notes,
        inventory_snapshot: inventorySnapshot,
        production_summary: {
          cycles_dumped: cyclesCount,
          produced_kg: totals.producedKg,
          merma_kg: totals.mermaKg,
          packed_kg: totals.packedKg,
          downtimes_total: downtimesCount,
          downtimes_open: openDowntimes,
        },
        signed: false,
      })
      setMsg({ type: 'success', text: 'Borrador guardado en este dispositivo' })
    } catch (e) {
      setMsg({ type: 'error', text: e.message || 'Error al guardar borrador' })
    } finally {
      setSaving(false)
    }
  }

  async function handleConfirm() {
    if (!shift?.id || !canSave) return
    if (openDowntimes > 0) {
      setMsg({ type: 'error', text: 'Cierra los paros activos antes de firmar la entrega' })
      return
    }
    setSaving(true)
    try {
      const now = new Date().toISOString()
      const handoverData = {
        incidents: form.incidents,
        pending_tasks: form.pending_tasks,
        signature_from: form.signature_from,
        signature_to: form.signature_to,
        notes: form.notes,
        inventory_snapshot: inventorySnapshot,
        production_summary: {
          cycles_dumped: cyclesCount,
          produced_kg: totals.producedKg,
          merma_kg: totals.mermaKg,
          packed_kg: totals.packedKg,
          downtimes_total: downtimesCount,
          downtimes_open: openDowntimes,
        },
        signed: true,
        signed_at: now,
      }
      // Fase 4: intenta enviar al backend; si no existe, guarda local
      const result = await submitHandover(shift.id, handoverData)
      setSigned(true)
      setSignedAt(now)
      setMsg({
        type: result.sent ? 'success' : 'warning',
        text: result.sent
          ? 'Entrega firmada y enviada al sistema'
          : 'Entrega firmada (guardado local, pendiente de sistema)',
      })
    } catch (e) {
      setMsg({ type: 'error', text: e.message || 'Error al firmar entrega' })
    } finally {
      setSaving(false)
    }
  }

  const inputStyle = {
    width: '100%', padding: '10px 12px', borderRadius: TOKENS.radius.sm,
    background: 'rgba(255,255,255,0.05)', border: `1px solid ${TOKENS.colors.border}`,
    color: 'white', fontSize: 13, fontFamily: 'inherit', marginBottom: 10,
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
            <span style={{ ...typo.title, color: TOKENS.colors.textSoft }}>Entrega de Turno</span>
          </div>
          {signed && (
            <span style={{
              padding: '4px 10px', borderRadius: TOKENS.radius.pill,
              background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)',
              fontSize: 11, fontWeight: 700, color: TOKENS.colors.warning,
            }}>FIRMADO (LOCAL)</span>
          )}
        </div>

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
          <div style={{ marginTop: 40, padding: 24, borderRadius: TOKENS.radius.xl, background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`, textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>&#x26A0;&#xFE0F;</div>
            <p style={{ ...typo.title, color: TOKENS.colors.warning }}>Sin turno activo</p>
            <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, marginTop: 6 }}>Abre un turno primero.</p>
          </div>
        ) : (
          <>
            {/* Resumen del turno */}
            <div style={{
              padding: 14, borderRadius: TOKENS.radius.xl, marginBottom: 12,
              background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
            }}>
              <p style={{ ...typo.overline, color: TOKENS.colors.textLow, margin: '0 0 8px' }}>RESUMEN DE TURNO</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <SummaryItem label="Ciclos" value={`${cyclesCount}`} typo={typo} />
                <SummaryItem label="Producido" value={`${totals.producedKg.toFixed(0)} kg`} typo={typo} />
                <SummaryItem label="Empacado" value={`${totals.packedKg.toFixed(0)} kg`} typo={typo} />
                <SummaryItem label="Merma" value={`${totals.mermaKg.toFixed(1)} kg`} typo={typo} />
                <SummaryItem label="Paros" value={`${downtimesCount}`} typo={typo} />
                <SummaryItem
                  label="Paros activos"
                  value={`${openDowntimes}`}
                  typo={typo}
                  alert={openDowntimes > 0}
                />
              </div>
            </div>

            {/* Avisos operativos UX-friendly (Fase 3) */}
            {(coherenceMsg || bigDiff || openDowntimes > 0 || openIncidentCount > 0) && (
              <div style={{
                padding: '12px 14px', borderRadius: TOKENS.radius.md, marginBottom: 12,
                background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)',
              }}>
                <p style={{ ...typo.body, color: TOKENS.colors.warning, margin: 0, fontWeight: 600 }}>
                  Revisa antes de firmar
                </p>
                <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                  {openDowntimes > 0 && (
                    <li style={{ ...typo.caption, color: TOKENS.colors.textSoft, marginBottom: 2 }}>
                      Hay {openDowntimes} paro{openDowntimes > 1 ? 's' : ''} sin cerrar
                    </li>
                  )}
                  {bigDiff && (
                    <li style={{ ...typo.caption, color: TOKENS.colors.textSoft, marginBottom: 2 }}>
                      Falta empacar {Math.round(diffKg)} kg del turno
                    </li>
                  )}
                  {coherenceMsg && (
                    <li style={{ ...typo.caption, color: TOKENS.colors.textSoft, marginBottom: 2 }}>
                      {coherenceMsg}
                    </li>
                  )}
                  {openIncidentCount > 0 && (
                    <li style={{ ...typo.caption, color: TOKENS.colors.textSoft, marginBottom: 2 }}>
                      Hay {openIncidentCount} incidencia{openIncidentCount > 1 ? 's' : ''} sin resolver
                    </li>
                  )}
                </ul>
              </div>
            )}

            {/* Inventario pendiente */}
            {inventorySnapshot.length > 0 && (
              <div style={{
                padding: 14, borderRadius: TOKENS.radius.xl, marginBottom: 12,
                background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)',
              }}>
                <p style={{ ...typo.overline, color: TOKENS.colors.warning, margin: '0 0 8px' }}>INVENTARIO EN PROCESO</p>
                {inventorySnapshot.map((row, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: i > 0 ? `1px solid ${TOKENS.colors.border}` : 'none' }}>
                    <span style={{ ...typo.caption, color: TOKENS.colors.text }}>{row.ref}</span>
                    <span style={{ ...typo.caption, color: TOKENS.colors.textMuted }}>{row.detail}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Incidencias del turno (estructuradas desde Odoo) */}
            {structuredIncidents.length > 0 && (
              <div style={{
                padding: 14, borderRadius: TOKENS.radius.xl, marginBottom: 12,
                background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
              }}>
                <p style={{ ...typo.overline, color: TOKENS.colors.textLow, margin: '0 0 8px' }}>
                  INCIDENCIAS REGISTRADAS ({structuredIncidents.length})
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {structuredIncidents.map(inc => {
                    const stateInfo = INCIDENT_STATES[inc.state] || INCIDENT_STATES.open
                    const sevInfo = INCIDENT_SEVERITIES.find(s => s.value === inc.severity) || INCIDENT_SEVERITIES[0]
                    return (
                      <div key={inc.id} style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '6px 8px', borderRadius: TOKENS.radius.sm,
                        background: stateInfo.bg, border: `1px solid ${stateInfo.color}33`,
                      }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: sevInfo.color, flexShrink: 0 }} />
                        <span style={{ ...typo.caption, color: TOKENS.colors.text, flex: 1 }}>{inc.name}</span>
                        <span style={{ ...typo.caption, color: stateInfo.color, fontSize: 10, fontWeight: 700 }}>
                          {stateInfo.label}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Formulario */}
            <div style={{
              padding: 16, borderRadius: TOKENS.radius.xl, marginBottom: 12,
              background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.borderBlue}`,
            }}>
              <p style={{ ...typo.title, color: TOKENS.colors.text, margin: '0 0 12px' }}>Entrega formal</p>

              <label style={{ ...typo.caption, color: TOKENS.colors.textMuted, display: 'block', marginBottom: 4 }}>Incidencias del turno</label>
              <textarea value={form.incidents}
                onChange={e => setForm(p => ({ ...p, incidents: e.target.value }))}
                rows={3} disabled={signed}
                placeholder="Eventos, anomalias, fallas importantes..."
                style={{ ...inputStyle, resize: 'vertical', opacity: signed ? 0.6 : 1 }} />

              <label style={{ ...typo.caption, color: TOKENS.colors.textMuted, display: 'block', marginBottom: 4 }}>Pendientes para proximo turno</label>
              <textarea value={form.pending_tasks}
                onChange={e => setForm(p => ({ ...p, pending_tasks: e.target.value }))}
                rows={3} disabled={signed}
                placeholder="Tareas por completar, reparaciones, seguimiento..."
                style={{ ...inputStyle, resize: 'vertical', opacity: signed ? 0.6 : 1 }} />

              <label style={{ ...typo.caption, color: TOKENS.colors.textMuted, display: 'block', marginBottom: 4 }}>
                Entrega (nombre) <span style={{ color: TOKENS.colors.error }}>*</span>
              </label>
              <input type="text" value={form.signature_from}
                onChange={e => setForm(p => ({ ...p, signature_from: e.target.value }))}
                disabled={signed}
                placeholder="Quien entrega"
                style={{ ...inputStyle, opacity: signed ? 0.6 : 1 }} />

              <label style={{ ...typo.caption, color: TOKENS.colors.textMuted, display: 'block', marginBottom: 4 }}>
                Recibe (nombre) <span style={{ color: TOKENS.colors.error }}>*</span>
              </label>
              <input type="text" value={form.signature_to}
                onChange={e => setForm(p => ({ ...p, signature_to: e.target.value }))}
                disabled={signed}
                placeholder="Quien recibe el turno"
                style={{ ...inputStyle, opacity: signed ? 0.6 : 1 }} />

              <label style={{ ...typo.caption, color: TOKENS.colors.textMuted, display: 'block', marginBottom: 4 }}>Notas adicionales</label>
              <textarea value={form.notes}
                onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                rows={2} disabled={signed}
                placeholder="Observaciones..."
                style={{ ...inputStyle, resize: 'vertical', opacity: signed ? 0.6 : 1 }} />

              {signed && signedAt && (
                <p style={{ ...typo.caption, color: TOKENS.colors.success, margin: '4px 0 12px' }}>
                  Firmado el {new Date(signedAt).toLocaleString()}
                </p>
              )}

              {!signed ? (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={handleSaveDraft} disabled={saving}
                    style={{
                      flex: 1, padding: '10px', borderRadius: TOKENS.radius.sm,
                      background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
                      color: TOKENS.colors.textMuted, fontSize: 13, fontWeight: 600,
                      opacity: saving ? 0.6 : 1,
                    }}>
                    {saving ? 'Guardando...' : 'Guardar borrador'}
                  </button>
                  <button type="button" onClick={handleConfirm} disabled={saving || !canSave}
                    style={{
                      flex: 2, padding: '10px', borderRadius: TOKENS.radius.sm,
                      background: !canSave ? TOKENS.colors.surface : 'linear-gradient(135deg, #15499B 0%, #2B8FE0 100%)',
                      border: `1px solid ${!canSave ? TOKENS.colors.border : 'transparent'}`,
                      color: 'white', fontSize: 13, fontWeight: 600,
                      opacity: saving ? 0.6 : 1,
                    }}>
                    {saving ? 'Firmando...' : 'Firmar entrega'}
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => { setSigned(false) }}
                  style={{
                    width: '100%', padding: '10px', borderRadius: TOKENS.radius.sm,
                    background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)',
                    color: TOKENS.colors.warning, fontSize: 13, fontWeight: 600,
                  }}>
                  Editar entrega
                </button>
              )}
            </div>
          </>
        )}
        <div style={{ height: 32 }} />
      </div>
    </div>
  )
}

function SummaryItem({ label, value, typo, alert }) {
  return (
    <div style={{
      padding: '8px 10px', borderRadius: TOKENS.radius.sm,
      background: alert ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.03)',
      border: `1px solid ${alert ? 'rgba(239,68,68,0.25)' : TOKENS.colors.border}`,
    }}>
      <p style={{ ...typo.overline, color: TOKENS.colors.textLow, margin: 0 }}>{label}</p>
      <p style={{
        ...typo.title, margin: '2px 0 0',
        color: alert ? TOKENS.colors.error : TOKENS.colors.text,
      }}>{value}</p>
    </div>
  )
}
