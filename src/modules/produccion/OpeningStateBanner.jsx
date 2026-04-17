// OpeningStateBanner.jsx — Snapshot de lo que recibe el turno entrante
// ───────────────────────────────────────────────────────────────────────────
// Consume POST /api/production/shift/opening-state y presenta al operador:
//   - PT heredado (inventario de producto terminado)
//   - Materiales pendientes
//   - Estado operativo (máquinas/ciclos abiertos)
//   - KPIs del turno anterior
//
// Backend retorna resumen agregado (counts/kg), no detalle por línea.
// Formato: { result: { ok, data: { pt:{}, materials:{}, operations:{}, kpis:{} } } }
//
// Semántica: "esto es lo que recibes", no "esto es lo que existe".
// Dismissible con sessionStorage para no molestar después del primer ack.
// ───────────────────────────────────────────────────────────────────────────

import { useEffect, useState, useCallback } from 'react'
import { TOKENS } from '../../tokens'
import { getOpeningState } from './api'

const DISMISS_KEY = (shiftId) => `gf_opening_ack_${shiftId}`

// ── Helpers para detectar datos relevantes ──────────────────────────────────
// Backend puede retornar pt/materials/operations como objetos-resumen o arrays.
// Estas funciones normalizan la detección.

function hasPTData(pt) {
  if (!pt) return false
  if (Array.isArray(pt)) return pt.length > 0
  return (pt.pending_receipt_count > 0 || pt.pending_reconcile_count > 0 || pt.pending_receipt_kg > 0)
}

function hasMaterialsData(materials) {
  if (!materials) return false
  if (Array.isArray(materials)) return materials.length > 0
  return (materials.open_issue_count > 0 || materials.open_settlement_count > 0 || materials.disputed_count > 0)
}

function hasOpsData(operations) {
  if (!operations) return false
  if (Array.isArray(operations)) return operations.length > 0
  return (operations.open_cycle_count > 0 || operations.open_downtime_count > 0 ||
          operations.ready_slot_count > 0 || operations.active_blockers?.length > 0)
}

function hasKpisData(kpis) {
  return kpis && (kpis.produced_kg || kpis.packed_kg || kpis.scrap_kg)
}

// ── Extraer snapshot del response JSONRPC ───────────────────────────────────
function extractSnapshot(res) {
  // Odoo JSONRPC: { jsonrpc, result: { ok, data: {...} } }
  if (res?.result?.data) return res.result.data
  // Directo: { ok, data: {...} }
  if (res?.data && typeof res.data === 'object' && !Array.isArray(res.data)) return res.data
  // Ya es el snapshot
  return res
}

export default function OpeningStateBanner({ shiftId, typo }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dismissed, setDismissed] = useState(false)
  const [expanded, setExpanded] = useState(false)

  // Check if already acknowledged this shift
  useEffect(() => {
    if (shiftId && sessionStorage.getItem(DISMISS_KEY(shiftId))) {
      setDismissed(true)
    }
  }, [shiftId])

  const load = useCallback(async () => {
    if (!shiftId || dismissed) return
    setLoading(true)
    try {
      const res = await getOpeningState(shiftId)
      const snap = extractSnapshot(res)
      // Solo mostrar si hay datos heredados reales
      if (snap && (hasPTData(snap.pt) || hasMaterialsData(snap.materials) || hasOpsData(snap.operations) || hasKpisData(snap.kpis))) {
        setData(snap)
      } else {
        setDismissed(true) // nada que mostrar
      }
    } catch (e) {
      // No bloquear el hub si falla — es complementario
      if (e.status === 404 || e.status === 400) {
        setDismissed(true) // endpoint no encontrado o sin datos
      } else {
        setError(e.message || 'No se pudo cargar estado de apertura')
      }
    } finally {
      setLoading(false)
    }
  }, [shiftId, dismissed])

  useEffect(() => { load() }, [load])

  function handleAck() {
    sessionStorage.setItem(DISMISS_KEY(shiftId), '1')
    setDismissed(true)
  }

  // ── No renderizar si no aplica ────────────────────────────────────────────
  if (dismissed || (!loading && !data && !error)) return null

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ ...cardBase, padding: 14, textAlign: 'center' }}>
        <span style={{ ...typo.caption, color: TOKENS.colors.textMuted }}>Cargando estado de apertura...</span>
      </div>
    )
  }

  // ── Error (no-bloqueante, solo informativo) ───────────────────────────────
  if (error) {
    return (
      <div style={{ ...cardBase, padding: 12, borderColor: 'rgba(239,68,68,0.25)' }}>
        <span style={{ ...typo.caption, color: TOKENS.colors.textMuted }}>{error}</span>
        <button onClick={() => { setError(''); load() }} style={{ ...typo.caption, color: TOKENS.colors.blue2, marginLeft: 8, textDecoration: 'underline' }}>
          Reintentar
        </button>
      </div>
    )
  }

  if (!data) return null

  const { pt, materials, operations, kpis } = data
  const sourceShift = data.source_shift_id
  const hasPT = hasPTData(pt)
  const hasMaterials = hasMaterialsData(materials)
  const hasOps = hasOpsData(operations)
  const hasKpis = hasKpisData(kpis)

  // ── Subtitle: resumen compacto ────────────────────────────────────────────
  function buildSubtitle() {
    const parts = []
    if (hasPT) {
      if (Array.isArray(pt)) {
        parts.push(`${pt.length} producto${pt.length > 1 ? 's' : ''} PT`)
      } else {
        const n = pt.pending_receipt_count || 0
        if (n > 0) parts.push(`${n} recepci${n > 1 ? 'ones' : 'on'} PT pendiente${n > 1 ? 's' : ''}`)
      }
    }
    if (hasMaterials) {
      if (Array.isArray(materials)) {
        parts.push(`${materials.length} material${materials.length > 1 ? 'es' : ''}`)
      } else {
        const issues = materials.open_issue_count || 0
        const disputed = materials.disputed_count || 0
        if (issues > 0) parts.push(`${issues} salida${issues > 1 ? 's' : ''} abiertas`)
        if (disputed > 0) parts.push(`${disputed} en disputa`)
      }
    }
    if (hasOps) {
      if (Array.isArray(operations)) {
        parts.push(`${operations.length} operacion${operations.length > 1 ? 'es' : ''}`)
      } else {
        const cycles = operations.open_cycle_count || 0
        if (cycles > 0) parts.push(`${cycles} ciclo${cycles > 1 ? 's' : ''} abierto${cycles > 1 ? 's' : ''}`)
        const blockers = operations.active_blockers?.length || 0
        if (blockers > 0) parts.push(`${blockers} bloqueo${blockers > 1 ? 's' : ''}`)
      }
    }
    return parts.length > 0 ? parts.join(' \u00b7 ') : 'Sin pendientes heredados'
  }

  // ── Blocker labels legibles ───────────────────────────────────────────────
  const BLOCKER_LABELS = {
    haccp: 'Checklist HACCP pendiente',
    energy_end: 'Lectura de energia pendiente',
    open_cycles: 'Ciclos de produccion abiertos',
    bag_reconciliation: 'Cuadratura de bolsas pendiente',
    scrap: 'Merma sin registrar',
  }

  return (
    <div style={cardBase}>
      {/* Header — siempre visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, width: '100%',
          padding: 0, background: 'none', border: 'none', cursor: 'pointer',
        }}
      >
        <div style={{
          width: 36, height: 36, borderRadius: TOKENS.radius.md,
          background: 'rgba(43,143,224,0.12)', border: '1px solid rgba(43,143,224,0.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2B8FE0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
          </svg>
        </div>
        <div style={{ flex: 1, textAlign: 'left' }}>
          <p style={{ ...typo.body, color: TOKENS.colors.text, margin: 0, fontWeight: 700, fontSize: 14 }}>
            Recibes del turno anterior
          </p>
          <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, marginTop: 2 }}>
            {buildSubtitle()}
            {sourceShift ? ` \u00b7 Turno #${sourceShift}` : ''}
          </p>
        </div>
        <svg
          width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: `transform ${TOKENS.motion.fast}` }}
        >
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {/* Body expandido */}
      {expanded && (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* KPIs del turno anterior */}
          {hasKpis && (
            <div>
              <p style={sectionLabel(typo)}>RESULTADO TURNO ANTERIOR</p>
              <div style={{ display: 'flex', gap: 8 }}>
                {kpis.produced_kg != null && (
                  <KpiChip label="Producido" value={`${fmtNum(kpis.produced_kg)} kg`} typo={typo} />
                )}
                {kpis.packed_kg != null && (
                  <KpiChip label="Empacado" value={`${fmtNum(kpis.packed_kg)} kg`} typo={typo} />
                )}
                {kpis.scrap_kg != null && kpis.scrap_kg > 0 && (
                  <KpiChip label="Merma" value={`${fmtNum(kpis.scrap_kg)} kg`} color={TOKENS.colors.warning} typo={typo} />
                )}
              </div>
            </div>
          )}

          {/* Producto Terminado heredado */}
          {hasPT && (
            <div>
              <p style={sectionLabel(typo)}>PRODUCTO TERMINADO QUE RECIBES</p>
              {Array.isArray(pt) ? (
                /* Array format: lista detallada */
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {pt.map((item, i) => (
                    <div key={item.product_id || i} style={itemRow}>
                      <span style={{ ...typo.caption, color: TOKENS.colors.textSoft, fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.product_name || item.name || `Producto ${item.product_id}`}
                      </span>
                      <span style={{ ...typo.caption, color: TOKENS.colors.blue2, fontWeight: 700, flexShrink: 0 }}>
                        {fmtNum(item.qty || item.quantity || 0)} {item.uom || 'uds'}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                /* Summary object: chips con counts */
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {pt.pending_receipt_count > 0 && (
                    <KpiChip label="Recepciones pendientes" value={pt.pending_receipt_count} typo={typo} />
                  )}
                  {pt.pending_receipt_kg > 0 && (
                    <KpiChip label="Kg por recibir" value={`${fmtNum(pt.pending_receipt_kg)} kg`} typo={typo} />
                  )}
                  {pt.received_kg > 0 && (
                    <KpiChip label="Ya recibido" value={`${fmtNum(pt.received_kg)} kg`} color={TOKENS.colors.success} typo={typo} />
                  )}
                  {pt.pending_reconcile_count > 0 && (
                    <KpiChip label="Por conciliar" value={pt.pending_reconcile_count} color={TOKENS.colors.warning} typo={typo} />
                  )}
                </div>
              )}
            </div>
          )}

          {/* Materiales pendientes */}
          {hasMaterials && (
            <div>
              <p style={sectionLabel(typo)}>MATERIALES PENDIENTES</p>
              {Array.isArray(materials) ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {materials.map((mat, i) => (
                    <div key={mat.material_id || i} style={itemRow}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ ...typo.caption, color: TOKENS.colors.textSoft, fontWeight: 600, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {mat.material_name || mat.name || `Material ${mat.material_id}`}
                        </span>
                      </div>
                      <span style={{ ...typo.caption, color: TOKENS.colors.textMuted, fontWeight: 700, flexShrink: 0 }}>
                        {fmtNum(mat.qty_remaining || mat.qty_pending || 0)} {mat.uom || ''}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {materials.open_issue_count > 0 && (
                    <KpiChip label="Salidas abiertas" value={materials.open_issue_count} typo={typo} />
                  )}
                  {materials.open_settlement_count > 0 && (
                    <KpiChip label="Liquidaciones abiertas" value={materials.open_settlement_count} typo={typo} />
                  )}
                  {materials.disputed_count > 0 && (
                    <KpiChip label="En disputa" value={materials.disputed_count} color={TOKENS.colors.warning} typo={typo} />
                  )}
                </div>
              )}
            </div>
          )}

          {/* Estado operativo */}
          {hasOps && (
            <div>
              <p style={sectionLabel(typo)}>ESTADO OPERATIVO</p>
              {Array.isArray(operations) ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {operations.map((op, i) => {
                    const isAlert = op.severity === 'high' || op.type === 'open_cycle' || op.type === 'maintenance'
                    return (
                      <div key={op.id || i} style={{ ...itemRow, borderColor: isAlert ? 'rgba(245,158,11,0.25)' : itemRow.borderColor }}>
                        <span style={{ ...typo.caption, color: isAlert ? TOKENS.colors.warning : TOKENS.colors.textSoft, fontWeight: 600, flex: 1 }}>
                          {op.description || op.label || op.type}
                        </span>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {/* Chips de conteo */}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {operations.open_cycle_count > 0 && (
                      <KpiChip label="Ciclos abiertos" value={operations.open_cycle_count} color={TOKENS.colors.warning} typo={typo} />
                    )}
                    {operations.ready_slot_count > 0 && (
                      <KpiChip label="Slots listos" value={operations.ready_slot_count} color={TOKENS.colors.success} typo={typo} />
                    )}
                    {operations.open_downtime_count > 0 && (
                      <KpiChip label="Paros activos" value={operations.open_downtime_count} color={TOKENS.colors.error} typo={typo} />
                    )}
                  </div>
                  {/* Blockers activos */}
                  {operations.active_blockers?.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {operations.active_blockers.map((b, i) => (
                        <div key={b} style={{ ...itemRow, borderColor: 'rgba(245,158,11,0.25)' }}>
                          <span style={{ fontSize: 14, flexShrink: 0 }}>{'\u26A0'}</span>
                          <span style={{ ...typo.caption, color: TOKENS.colors.warning, fontWeight: 600, flex: 1 }}>
                            {BLOCKER_LABELS[b] || b}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Botón de aceptación */}
          <button
            onClick={handleAck}
            style={{
              width: '100%', padding: '12px', borderRadius: TOKENS.radius.lg, marginTop: 4,
              background: 'linear-gradient(90deg, rgba(43,143,224,0.15), rgba(43,143,224,0.06))',
              border: '1px solid rgba(43,143,224,0.30)',
              color: TOKENS.colors.blue2, fontSize: 13, fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Recibido — ocultar
          </button>
        </div>
      )}
    </div>
  )
}

// ── Helpers y estilos ─────────────────────────────────────────────────────────

function fmtNum(n) {
  if (n == null) return '0'
  const num = Number(n)
  if (Number.isNaN(num)) return '0'
  return num % 1 === 0 ? num.toLocaleString('es-MX') : num.toFixed(1)
}

function KpiChip({ label, value, color, typo }) {
  return (
    <div style={{
      flex: 1, minWidth: 80, padding: '8px 10px', borderRadius: TOKENS.radius.sm,
      background: TOKENS.colors.surfaceSoft, border: `1px solid ${TOKENS.colors.border}`,
      textAlign: 'center',
    }}>
      <div style={{ ...typo.caption, color: TOKENS.colors.textMuted, fontSize: 10, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: color || TOKENS.colors.textSoft, letterSpacing: '-0.02em' }}>{value}</div>
    </div>
  )
}

function sectionLabel(typo) {
  return { ...typo.overline, color: TOKENS.colors.textLow, margin: 0, marginBottom: 6, fontSize: 10 }
}

const cardBase = {
  padding: 14, borderRadius: TOKENS.radius.xl, marginTop: 10,
  background: 'linear-gradient(180deg, rgba(43,143,224,0.08), rgba(43,143,224,0.02))',
  border: '1px solid rgba(43,143,224,0.18)',
}

const itemRow = {
  display: 'flex', alignItems: 'center', gap: 8,
  padding: '8px 10px', borderRadius: TOKENS.radius.sm,
  background: TOKENS.colors.surfaceSoft, border: `1px solid ${TOKENS.colors.border}`,
}
