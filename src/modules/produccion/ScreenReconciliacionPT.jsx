// ScreenReconciliacionPT.jsx
// Conciliacion fisica de Almacen PT por producto/unidad.
//
// Esta pantalla ya no captura kilos manuales. Usa el inventario canonico de PT
// (stock.quant via /pwa-pt/inventory), permite validar conteo fisico por SKU y
// registrar merma desde PT. El traspaso a Entregas sigue ocurriendo en
// /almacen-pt/traspaso y la entrada final a Entregas solo la confirma ese rol.

import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useSession } from '../../App'
import { TOKENS, getTypo } from '../../tokens'
import {
  DEFAULT_WAREHOUSE_ID,
  createScrap,
  fmtKg,
  fmtNum,
  getInventoryCanonical,
  getScrapReasons,
  getTodayTransfers,
} from '../almacen-pt/ptService'
import { logScreenError } from '../shared/logScreenError'

const FALLBACK_REASONS = [
  { id: 'damage', name: 'Roto / danado' },
  { id: 'shortage', name: 'Faltante fisico' },
  { id: 'contamination', name: 'Contaminado' },
  { id: 'expired', name: 'Caducado' },
  { id: 'other', name: 'Otro' },
]

export default function ScreenReconciliacionPT() {
  const { session } = useSession()
  const navigate = useNavigate()
  const location = useLocation()
  const [sw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])

  const warehouseId = Number(session?.warehouse_id || DEFAULT_WAREHOUSE_ID)
  const employeeId = Number(session?.employee_id || session?.employee?.id || 0) || 0
  const backTo = location.state?.backTo || '/almacen-pt/recepcion'

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [inventory, setInventory] = useState(null)
  const [rows, setRows] = useState([])
  const [reasons, setReasons] = useState(FALLBACK_REASONS)
  const [transfers, setTransfers] = useState([])
  const [draft, setDraft] = useState({})
  const [msg, setMsg] = useState(null)

  useEffect(() => { loadData() }, [])
  useEffect(() => {
    if (!msg) return undefined
    const t = setTimeout(() => setMsg(null), 5200)
    return () => clearTimeout(t)
  }, [msg])

  async function loadData() {
    setLoading(true)
    try {
      const [invRes, reasonRes, transferRes] = await Promise.allSettled([
        getInventoryCanonical(warehouseId),
        getScrapReasons(),
        getTodayTransfers(warehouseId),
      ])

      if (invRes.status === 'rejected') logScreenError('ScreenReconciliacionPT', 'getInventoryCanonical', invRes.reason)
      if (reasonRes.status === 'rejected') logScreenError('ScreenReconciliacionPT', 'getScrapReasons', reasonRes.reason)
      if (transferRes.status === 'rejected') logScreenError('ScreenReconciliacionPT', 'getTodayTransfers', transferRes.reason)

      const inv = invRes.status === 'fulfilled' ? invRes.value : null
      const reasonList = reasonRes.status === 'fulfilled' && Array.isArray(reasonRes.value) && reasonRes.value.length
        ? reasonRes.value
        : FALLBACK_REASONS
      const normalizedRows = normalizeRows(inv?.items || [])

      setInventory(inv)
      setReasons(reasonList)
      setRows(normalizedRows)
      setTransfers(transferRes.status === 'fulfilled' && Array.isArray(transferRes.value) ? transferRes.value : [])
      setDraft(buildInitialDraft(normalizedRows, reasonList, draft))
    } catch (e) {
      logScreenError('ScreenReconciliacionPT', 'loadData', e)
      setMsg({ type: 'error', text: 'No se pudo cargar el inventario PT.' })
    } finally {
      setLoading(false)
    }
  }

  function updateDraft(productId, field, value) {
    setDraft(prev => ({
      ...prev,
      [productId]: {
        ...(prev[productId] || {}),
        [field]: value,
      },
    }))
  }

  function validateDraft() {
    for (const row of rows) {
      const state = draft[row.product_id] || {}
      const counted = parseQty(state.counted)
      const scrap = parseQty(state.scrap)
      if (counted < 0 || scrap < 0) return 'Las cantidades no pueden ser negativas.'
      if (scrap > counted) return `La merma de ${row.product_name} no puede ser mayor al conteo fisico.`
      if (scrap > row.quantity) return `La merma de ${row.product_name} no puede superar el stock disponible en PT.`
      if (scrap > 0 && !state.reason) return `Selecciona motivo de merma para ${row.product_name}.`
    }
    return ''
  }

  async function handleSave() {
    const validationError = validateDraft()
    if (validationError) {
      setMsg({ type: 'error', text: validationError })
      return
    }

    const scrapRows = rows
      .map(row => ({ row, state: draft[row.product_id] || {} }))
      .filter(({ state }) => parseQty(state.scrap) > 0)

    setSaving(true)
    try {
      for (const { row, state } of scrapRows) {
        await createScrap(
          warehouseId,
          employeeId || undefined,
          row.product_id,
          parseQty(state.scrap),
          resolveReasonTag(state.reason, reasons),
          state.notes || ''
        )
      }

      setMsg({
        type: 'success',
        text: scrapRows.length
          ? `Validacion guardada y ${scrapRows.length} merma(s) registrada(s).`
          : 'Validacion fisica guardada. Continua con el traspaso cuando estes listo.',
      })
      await loadData()
    } catch (e) {
      logScreenError('ScreenReconciliacionPT', 'handleSave', e)
      setMsg({ type: 'error', text: e?.message || 'No se pudo guardar la validacion.' })
    } finally {
      setSaving(false)
    }
  }

  const totals = useMemo(() => {
    return rows.reduce((acc, row) => {
      const state = draft[row.product_id] || {}
      const counted = parseQty(state.counted)
      const scrap = parseQty(state.scrap)
      acc.systemQty += row.quantity
      acc.systemKg += row.total_kg
      acc.countedQty += counted
      acc.scrapQty += scrap
      acc.transferQty += Math.max(0, counted - scrap)
      acc.transferKg += Math.max(0, counted - scrap) * row.weight_per_unit
      return acc
    }, { systemQty: 0, systemKg: 0, countedQty: 0, scrapQty: 0, transferQty: 0, transferKg: 0 })
  }, [rows, draft])

  const sourceLabel = inventory?._source === 'live'
    ? 'datos en vivo'
    : inventory?._source?.startsWith('cache')
      ? 'datos en cache'
      : 'sin conexion completa'

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
        input, select, textarea { font-family: 'DM Sans', sans-serif; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <div style={{ maxWidth: 520, margin: '0 auto', padding: '0 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 20, paddingBottom: 16 }}>
          <button onClick={() => navigate(backTo)} style={circleButtonStyle()}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.72)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
            </svg>
          </button>
          <div style={{ flex: 1 }}>
            <span style={{ ...typo.title, color: TOKENS.colors.textSoft }}>Conciliacion PT</span>
            <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '2px 0 0' }}>
              Rolito + Barra por producto
            </p>
          </div>
          <button onClick={loadData} disabled={loading || saving} style={circleButtonStyle()}>
            <span style={{ color: TOKENS.colors.textMuted, fontSize: 18 }}>↻</span>
          </button>
        </div>

        {msg && <Alert msg={msg} typo={typo} />}

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 70 }}>
            <div style={{ width: 32, height: 32, border: '2px solid rgba(255,255,255,0.12)', borderTop: '2px solid #2B8FE0', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : (
          <>
            <SummaryCard typo={typo} totals={totals} sourceLabel={sourceLabel} warehouseName={inventory?.warehouse_name} />

            <InfoCard typo={typo}>
              Esta pantalla valida fisicamente lo que ya existe en PT. No da entrada a Entregas.
              Para generar el pendiente del siguiente almacenista usa <strong>Traspaso a CEDIS</strong>;
              Entregas lo recibira despues en su propia pantalla.
            </InfoCard>

            {rows.length === 0 ? (
              <EmptyInventory typo={typo} onBack={() => navigate('/almacen-pt/recepcion')} />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {rows.map(row => (
                  <ProductCard
                    key={row.product_id}
                    row={row}
                    state={draft[row.product_id] || {}}
                    reasons={reasons}
                    typo={typo}
                    onChange={(field, value) => updateDraft(row.product_id, field, value)}
                  />
                ))}
              </div>
            )}

            <div style={{ position: 'sticky', bottom: 0, padding: '14px 0 18px', background: 'linear-gradient(180deg, rgba(5,14,25,0) 0%, rgba(5,14,25,0.96) 35%)' }}>
              <button
                onClick={handleSave}
                disabled={saving || rows.length === 0}
                style={{
                  width: '100%', padding: '14px', borderRadius: TOKENS.radius.lg,
                  color: 'white', fontSize: 14, fontWeight: 800, letterSpacing: 0.2,
                  background: 'linear-gradient(135deg, #15803d 0%, #22c55e 100%)',
                  opacity: saving || rows.length === 0 ? 0.55 : 1,
                }}
              >
                {saving ? 'Guardando...' : 'Guardar validacion fisica'}
              </button>
              <button
                onClick={() => navigate('/almacen-pt/traspaso', { state: { backTo: '/produccion/reconciliacion' } })}
                style={{
                  width: '100%', padding: '13px', marginTop: 10, borderRadius: TOKENS.radius.lg,
                  color: TOKENS.colors.blue2, fontSize: 14, fontWeight: 800,
                  background: 'rgba(43,143,224,0.1)', border: '1px solid rgba(43,143,224,0.28)',
                }}
              >
                Continuar a Traspaso a CEDIS
              </button>
              <button
                onClick={() => navigate('/almacen-pt/recepcion')}
                style={{
                  width: '100%', padding: '12px', marginTop: 8, borderRadius: TOKENS.radius.lg,
                  color: TOKENS.colors.textMuted, fontSize: 13, fontWeight: 700,
                }}
              >
                Volver a validaciones de entrada
              </button>
            </div>

            {transfers.length > 0 && (
              <div style={{ ...cardStyle(), marginBottom: 28 }}>
                <p style={{ ...typo.overline, color: TOKENS.colors.textLow, margin: '0 0 8px' }}>TRASPASOS DE HOY</p>
                <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0 }}>
                  {transfers.length} movimiento(s) generados hacia CEDIS. La recepcion final depende del almacenista de Entregas.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function ProductCard({ row, state, reasons, typo, onChange }) {
  const counted = parseQty(state.counted)
  const scrap = parseQty(state.scrap)
  const transferQty = Math.max(0, counted - scrap)
  const hasDifference = Math.abs(counted - row.quantity) > 0.0001

  return (
    <div style={{
      ...cardStyle(),
      borderColor: scrap > 0 ? 'rgba(245,158,11,0.36)' : hasDifference ? 'rgba(43,143,224,0.32)' : TOKENS.colors.border,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <p style={{ ...typo.body, color: TOKENS.colors.text, fontWeight: 800, margin: 0 }}>{row.product_name}</p>
          <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '4px 0 0' }}>
            {row.family_label} · {fmtNum(row.quantity)} disp. · {fmtKg(row.total_kg)}
          </p>
        </div>
        <span style={{
          padding: '5px 10px', borderRadius: TOKENS.radius.pill,
          background: row.product_family === 'BARRA' ? 'rgba(245,158,11,0.12)' : 'rgba(43,143,224,0.12)',
          border: `1px solid ${row.product_family === 'BARRA' ? 'rgba(245,158,11,0.24)' : 'rgba(43,143,224,0.24)'}`,
          color: row.product_family === 'BARRA' ? TOKENS.colors.warning : TOKENS.colors.blue2,
          fontSize: 11, fontWeight: 800,
        }}>{row.family_label}</span>
      </div>

      {row.location_summary && (
        <p style={{ ...typo.caption, color: TOKENS.colors.textLow, margin: '8px 0 0' }}>{row.location_summary}</p>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
        <NumberField
          label="Conteo fisico"
          value={state.counted ?? ''}
          onChange={(value) => onChange('counted', value)}
          typo={typo}
        />
        <NumberField
          label="Merma"
          value={state.scrap ?? ''}
          onChange={(value) => onChange('scrap', value)}
          typo={typo}
          tone={scrap > 0 ? 'warning' : 'normal'}
        />
      </div>

      {scrap > 0 && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <select
            value={state.reason || ''}
            onChange={e => onChange('reason', e.target.value)}
            style={fieldStyle()}
          >
            <option value="">Motivo de merma...</option>
            {reasons.map(r => (
              <option key={String(r.id ?? r.tag ?? r.name)} value={String(r.id ?? r.tag ?? r.name)}>
                {r.name || r.label || r.tag}
              </option>
            ))}
          </select>
          <textarea
            value={state.notes || ''}
            onChange={e => onChange('notes', e.target.value)}
            placeholder="Notas de merma..."
            rows={2}
            style={{ ...fieldStyle(), resize: 'vertical' }}
          />
        </div>
      )}

      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginTop: 12, paddingTop: 10, borderTop: `1px solid ${TOKENS.colors.border}`,
      }}>
        <span style={{ ...typo.caption, color: TOKENS.colors.textMuted }}>Listo para traspaso</span>
        <span style={{ ...typo.body, color: TOKENS.colors.success, fontWeight: 900 }}>
          {fmtNum(transferQty)} u · {fmtKg(transferQty * row.weight_per_unit)}
        </span>
      </div>
    </div>
  )
}

function SummaryCard({ typo, totals, sourceLabel, warehouseName }) {
  return (
    <div style={{
      ...cardStyle(),
      background: 'linear-gradient(160deg, rgba(43,143,224,0.12), rgba(15,23,42,0.64))',
      border: '1px solid rgba(43,143,224,0.28)',
    }}>
      <p style={{ ...typo.overline, color: TOKENS.colors.textLow, margin: 0 }}>INVENTARIO PT CONSOLIDADO</p>
      <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '4px 0 12px' }}>
        {warehouseName || 'Almacen PT'} · {sourceLabel}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <MiniMetric typo={typo} label="Sistema" value={`${fmtNum(totals.systemQty)} u`} sub={fmtKg(totals.systemKg)} />
        <MiniMetric typo={typo} label="Conteo" value={`${fmtNum(totals.countedQty)} u`} sub="fisico" />
        <MiniMetric typo={typo} label="Merma" value={`${fmtNum(totals.scrapQty)} u`} sub="salida PT" tone="warning" />
        <MiniMetric typo={typo} label="A traspasar" value={`${fmtNum(totals.transferQty)} u`} sub={fmtKg(totals.transferKg)} tone="success" />
      </div>
    </div>
  )
}

function MiniMetric({ typo, label, value, sub, tone = 'normal' }) {
  const color = tone === 'success' ? TOKENS.colors.success : tone === 'warning' ? TOKENS.colors.warning : TOKENS.colors.text
  return (
    <div style={{
      padding: '10px 12px', borderRadius: TOKENS.radius.md,
      background: 'rgba(255,255,255,0.035)', border: `1px solid ${TOKENS.colors.border}`,
    }}>
      <p style={{ ...typo.overline, color: TOKENS.colors.textLow, margin: 0 }}>{label}</p>
      <p style={{ ...typo.title, color, margin: '2px 0 0' }}>{value}</p>
      <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0 }}>{sub}</p>
    </div>
  )
}

function InfoCard({ typo, children }) {
  return (
    <div style={{
      ...cardStyle(),
      background: 'rgba(43,143,224,0.07)',
      border: '1px solid rgba(43,143,224,0.22)',
    }}>
      <p style={{ ...typo.caption, color: TOKENS.colors.textSoft, margin: 0, lineHeight: 1.55 }}>{children}</p>
    </div>
  )
}

function EmptyInventory({ typo, onBack }) {
  return (
    <div style={{ ...cardStyle(), textAlign: 'center', padding: 22 }}>
      <p style={{ ...typo.title, color: TOKENS.colors.text, margin: 0 }}>Sin producto PT disponible</p>
      <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '8px 0 16px' }}>
        Primero valida entradas desde Recepcion por linea o espera a que produccion genere PT.
      </p>
      <button onClick={onBack} style={{
        padding: '11px 16px', borderRadius: TOKENS.radius.md,
        background: 'rgba(43,143,224,0.12)', color: TOKENS.colors.blue2,
        fontWeight: 800,
      }}>
        Regresar a recepciones
      </button>
    </div>
  )
}

function Alert({ msg, typo }) {
  const isSuccess = msg.type === 'success'
  const isWarning = msg.type === 'warning'
  const color = isSuccess ? TOKENS.colors.success : isWarning ? TOKENS.colors.warning : TOKENS.colors.error
  return (
    <div style={{
      marginBottom: 12, padding: '10px 14px', borderRadius: TOKENS.radius.md,
      background: isSuccess ? 'rgba(34,197,94,0.12)' : isWarning ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.12)',
      border: `1px solid ${isSuccess ? 'rgba(34,197,94,0.3)' : isWarning ? 'rgba(245,158,11,0.3)' : 'rgba(239,68,68,0.3)'}`,
    }}>
      <span style={{ ...typo.caption, color }}>{msg.text}</span>
    </div>
  )
}

function NumberField({ label, value, onChange, typo, tone = 'normal' }) {
  const border = tone === 'warning' ? 'rgba(245,158,11,0.45)' : TOKENS.colors.border
  return (
    <label>
      <span style={{ ...typo.overline, color: TOKENS.colors.textLow, display: 'block', marginBottom: 5 }}>{label}</span>
      <input
        type="number"
        inputMode="decimal"
        min="0"
        step="1"
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ ...fieldStyle(), border: `1px solid ${border}`, fontSize: 18, fontWeight: 900, textAlign: 'center' }}
      />
    </label>
  )
}

function normalizeRows(items) {
  return (Array.isArray(items) ? items : [])
    .map(item => {
      const quantity = Number(item.quantity || 0)
      const weight = Number(item.weight_per_unit || 1) || 1
      const productFamily = item.product_family || 'OTRO'
      const locations = Array.isArray(item.stock_locations) ? item.stock_locations : []
      return {
        product_id: Number(item.product_id || item.id),
        product_name: item.product_name || item.product || 'Producto',
        product_family: productFamily,
        family_label: productFamily === 'BARRA' ? 'Barra' : productFamily === 'ROLITO' ? 'Rolito' : 'PT',
        quantity,
        weight_per_unit: weight,
        total_kg: Number(item.total_kg ?? quantity * weight) || 0,
        location_summary: summarizeLocations(locations),
      }
    })
    .filter(row => row.product_id && row.quantity > 0)
    .sort((a, b) => {
      const familyOrder = { ROLITO: 1, BARRA: 2, OTRO: 3 }
      return (familyOrder[a.product_family] || 9) - (familyOrder[b.product_family] || 9) ||
        a.product_name.localeCompare(b.product_name)
    })
}

function buildInitialDraft(rows, reasons, previous = {}) {
  const firstReason = String(reasons?.[0]?.id ?? reasons?.[0]?.tag ?? reasons?.[0]?.name ?? '')
  const next = {}
  for (const row of rows) {
    const old = previous[row.product_id] || {}
    next[row.product_id] = {
      counted: old.counted ?? String(row.quantity),
      scrap: old.scrap ?? '0',
      reason: old.reason ?? firstReason,
      notes: old.notes ?? '',
    }
  }
  return next
}

function summarizeLocations(locations) {
  const visible = locations
    .filter(l => Number(l.qty || l.quantity || 0) > 0)
    .map(l => `${l.name || l.location_name || 'Ubicacion'}: ${fmtNum(Number(l.qty || l.quantity || 0))}`)
  if (!visible.length) return ''
  return visible.slice(0, 2).join(' · ') + (visible.length > 2 ? ` · +${visible.length - 2}` : '')
}

function parseQty(value) {
  if (value === '' || value == null) return 0
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function resolveReasonTag(value, reasons) {
  const found = reasons.find(r => String(r.id ?? r.tag ?? r.name) === String(value))
  return found?.tag || found?.id || found?.name || value || 'other'
}

function cardStyle() {
  return {
    padding: 14,
    borderRadius: TOKENS.radius.xl,
    marginBottom: 12,
    background: TOKENS.glass.panel,
    border: `1px solid ${TOKENS.colors.border}`,
  }
}

function fieldStyle() {
  return {
    width: '100%',
    padding: '10px 12px',
    borderRadius: TOKENS.radius.md,
    background: TOKENS.colors.surface,
    border: `1px solid ${TOKENS.colors.border}`,
    color: TOKENS.colors.text,
    outline: 'none',
  }
}

function circleButtonStyle() {
  return {
    width: 38,
    height: 38,
    borderRadius: TOKENS.radius.md,
    background: TOKENS.colors.surface,
    border: `1px solid ${TOKENS.colors.border}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  }
}
