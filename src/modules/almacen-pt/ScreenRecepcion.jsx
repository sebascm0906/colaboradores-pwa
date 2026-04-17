// ScreenRecepcion.jsx — V3 Recepción PT por línea
// ───────────────────────────────────────────────────────────────────────────
// Backend es autoridad. Frontend NO calcula diferencias, NO aplica tolerancias.
//
// Fuentes:
//   GET  /api/pt/reception/pending  → pending_posting + pending_receipt
//   POST /api/pt/reception/create   → gf.packing.entry + gf.inventory.posting
//
// Estructura:
//   - Separación visual BARRA / ROLITO según product_family del backend.
//   - Cada item muestra: producido (qty_reported backend), recibido (qty_received),
//     pendiente (qty_pending) y estado del bucket.
//   - Operador captura "recibí N" y confirma. Todo lo demás lo resuelve backend.
// ───────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../App'
import { TOKENS, getTypo } from '../../tokens'
import {
  getPendingReceptions,
  confirmReception,
  saveReceptionLocal,
  getTodayReceptionsLocal,
  fmtNum,
  DEFAULT_WAREHOUSE_ID,
} from './ptService'
import { logScreenError } from '../shared/logScreenError'

const LINE_ORDER = ['BARRA', 'ROLITO', 'OTRO']

function familyOf(row) {
  const raw = String(row?.product_family || row?.line || row?.family || '').toUpperCase()
  if (raw.includes('BARRA')) return 'BARRA'
  if (raw.includes('ROLITO')) return 'ROLITO'
  return raw || 'OTRO'
}

function num(x, fallback = 0) {
  const n = Number(x)
  return Number.isFinite(n) ? n : fallback
}

/**
 * Normaliza un row del backend en el shape que consume la UI.
 * Sin recálculo: respeta los campos del backend y solo da fallbacks defensivos.
 */
function normalizePending(row, bucket) {
  const qtyReported = num(row?.qty_reported ?? row?.qty_declared ?? row?.qty_expected)
  const qtyReceived = num(row?.qty_received ?? 0)
  const qtyPending  = row?.qty_pending != null
    ? num(row.qty_pending)
    : Math.max(0, qtyReported - qtyReceived)
  return {
    id: row?.id || row?.packing_entry_id || `${bucket}-${row?.product_id}-${Math.random()}`,
    packing_entry_id: row?.packing_entry_id || row?.id || null,
    product_id: row?.product_id || null,
    product_name: row?.product_name || (typeof row?.product === 'object' ? row?.product?.name : row?.product) || '—',
    family: familyOf(row),
    qty_reported: qtyReported,
    qty_received: qtyReceived,
    qty_pending: qtyPending,
    state: row?.state || bucket,
    state_label: row?.state_label || (bucket === 'pending_posting' ? 'Por postear' : 'Por recibir'),
    bucket,
    declared_at: row?.declared_at || row?.created_at || null,
    raw: row,
  }
}

function groupByLine(items) {
  const groups = {}
  for (const it of items) {
    const fam = it.family || 'OTRO'
    if (!groups[fam]) groups[fam] = { line: fam, items: [], total_pending: 0 }
    groups[fam].items.push(it)
    groups[fam].total_pending += num(it.qty_pending)
  }
  return LINE_ORDER
    .map(l => groups[l])
    .filter(Boolean)
    .concat(Object.values(groups).filter(g => !LINE_ORDER.includes(g.line)))
}

export default function ScreenRecepcion() {
  const { session } = useSession()
  const navigate = useNavigate()
  const [sw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])

  const warehouseId = session?.warehouse_id || DEFAULT_WAREHOUSE_ID

  const [pending, setPending] = useState({ pending_posting: [], pending_receipt: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Selection
  const [selected, setSelected] = useState(null) // normalized pending row
  const [qtyReceived, setQtyReceived] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    setError('')
    try {
      const result = await getPendingReceptions(warehouseId)
      setPending({
        pending_posting: Array.isArray(result?.pending_posting) ? result.pending_posting : [],
        pending_receipt: Array.isArray(result?.pending_receipt) ? result.pending_receipt : [],
      })
    } catch (e) {
      logScreenError('ScreenRecepcion', 'loadData', e)
      setError('No se pudieron cargar los pendientes. Intenta recargar.')
    }
    setLoading(false)
  }

  const postingNorm = useMemo(
    () => pending.pending_posting.map(r => normalizePending(r, 'pending_posting')),
    [pending.pending_posting]
  )
  const receiptNorm = useMemo(
    () => pending.pending_receipt.map(r => normalizePending(r, 'pending_receipt')),
    [pending.pending_receipt]
  )

  const postingGroups = useMemo(() => groupByLine(postingNorm), [postingNorm])
  const receiptGroups = useMemo(() => groupByLine(receiptNorm), [receiptNorm])

  const hasPending = postingNorm.length + receiptNorm.length > 0
  const todayReceptions = getTodayReceptionsLocal()

  function startCapture(row) {
    setSelected(row)
    setQtyReceived(row.qty_pending > 0 ? String(row.qty_pending) : '')
    setNotes('')
    setError('')
    setSuccess('')
  }

  function cancelCapture() {
    setSelected(null)
    setQtyReceived('')
    setNotes('')
  }

  const canSave = selected && num(qtyReceived) > 0 && !saving

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    setError('')
    const payload = {
      warehouse_id: warehouseId,
      employee_id: session?.employee_id || 0,
      packing_entry_id: selected.packing_entry_id || undefined,
      product_id: selected.product_id || undefined,
      qty_reported: selected.qty_reported || undefined,
      qty_received: num(qtyReceived),
      notes: notes.trim(),
    }
    try {
      const result = await confirmReception(payload)
      // Mirror local (historial inmediato, backend es autoridad)
      saveReceptionLocal({
        product_id: selected.product_id,
        product_name: selected.product_name,
        qty_reported: selected.qty_reported,
        qty_received: num(qtyReceived),
        notes: notes.trim(),
        employee_id: session?.employee_id || 0,
        warehouse_id: warehouseId,
        backend_id: result?.id || result?.packing_entry_id || null,
      })
      setSuccess(`Recepción registrada: ${fmtNum(num(qtyReceived))} × ${selected.product_name}`)
      cancelCapture()
      await loadData()
      setTimeout(() => setSuccess(''), 3000)
    } catch (e) {
      logScreenError('ScreenRecepcion', 'handleSave', e)
      setError(e?.message || 'Error al registrar. Reintenta.')
    } finally {
      setSaving(false)
    }
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
        input, textarea { font-family: 'DM Sans', sans-serif; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 16px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 20, paddingBottom: 12 }}>
          <button onClick={() => navigate('/almacen-pt')} style={iconBtn}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
            </svg>
          </button>
          <div style={{ flex: 1 }}>
            <span style={{ ...typo.title, color: TOKENS.colors.textSoft }}>Recepción por línea</span>
            <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, marginTop: 2 }}>
              {todayReceptions.length > 0 ? `${todayReceptions.length} recepciones hoy` : 'BARRA · ROLITO'}
            </p>
          </div>
          <button onClick={loadData} style={iconBtn}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 4v6h6"/><path d="M23 20v-6h-6"/><path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15"/>
            </svg>
          </button>
        </div>

        {/* Status banner: backend live */}
        <div style={bannerLive}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: TOKENS.colors.success }} />
          <p style={{ ...typo.caption, color: TOKENS.colors.success, margin: 0 }}>
            Conectado al backend — datos y diferencias calculados por Odoo.
          </p>
        </div>

        {error && (
          <div style={errorBox}>
            <p style={{ ...typo.caption, color: TOKENS.colors.error, margin: 0 }}>{error}</p>
          </div>
        )}
        {success && (
          <div style={successBox}>
            <p style={{ ...typo.body, color: TOKENS.colors.success, margin: 0, fontWeight: 600 }}>{success}</p>
          </div>
        )}

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}>
            <div style={{ width: 32, height: 32, border: '2px solid rgba(255,255,255,0.12)', borderTop: '2px solid #2B8FE0', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : selected ? (
          <CaptureForm
            selected={selected}
            qtyReceived={qtyReceived}
            setQtyReceived={setQtyReceived}
            notes={notes}
            setNotes={setNotes}
            canSave={canSave}
            saving={saving}
            onSave={handleSave}
            onCancel={cancelCapture}
            typo={typo}
          />
        ) : !hasPending ? (
          <EmptyState
            typo={typo}
            onNext={() => navigate('/produccion/reconciliacion')}
          />
        ) : (
          <>
            {receiptGroups.length > 0 && (
              <Section
                title="POR RECIBIR"
                subtitle="Producción declaró, falta llegada física"
                groups={receiptGroups}
                onSelect={startCapture}
                typo={typo}
                tone="warning"
              />
            )}
            {postingGroups.length > 0 && (
              <Section
                title="POR POSTEAR"
                subtitle="Ya recibido, falta postear a inventario"
                groups={postingGroups}
                onSelect={startCapture}
                typo={typo}
                tone="blue"
              />
            )}

            {/* Next-step hint */}
            <NextStepHint
              typo={typo}
              onNext={() => navigate('/produccion/reconciliacion')}
            />
            <div style={{ height: 32 }} />
          </>
        )}
      </div>
    </div>
  )
}

// ── Subcomponents ────────────────────────────────────────────────────────────

function Section({ title, subtitle, groups, onSelect, typo, tone }) {
  const accent = tone === 'warning' ? TOKENS.colors.warning : TOKENS.colors.blue2
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
        <p style={{ ...typo.overline, color: accent, margin: 0 }}>{title}</p>
        <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0 }}>{subtitle}</p>
      </div>
      {groups.map(g => (
        <div key={g.line} style={{ marginBottom: 14 }}>
          <div style={{
            padding: '8px 12px', borderRadius: TOKENS.radius.sm,
            background: TOKENS.colors.surfaceSoft, border: `1px solid ${TOKENS.colors.border}`,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6,
          }}>
            <span style={{ ...typo.caption, color: TOKENS.colors.textSoft, fontWeight: 700, letterSpacing: '0.08em' }}>
              {g.line}
            </span>
            <span style={{ ...typo.caption, color: TOKENS.colors.textMuted }}>
              {g.items.length} ítem{g.items.length === 1 ? '' : 's'} · {fmtNum(g.total_pending)} pend.
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {g.items.map(row => (
              <PendingRow key={row.id} row={row} onSelect={onSelect} typo={typo} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function PendingRow({ row, onSelect, typo }) {
  return (
    <button
      onClick={() => onSelect(row)}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
        borderRadius: TOKENS.radius.md, textAlign: 'left', width: '100%',
        background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ ...typo.body, color: TOKENS.colors.text, margin: 0, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {row.product_name}
        </p>
        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <MiniKpi label="Producido" value={fmtNum(row.qty_reported)} color={TOKENS.colors.textMuted} typo={typo} />
          <MiniKpi label="Recibido"  value={fmtNum(row.qty_received)} color={TOKENS.colors.textMuted} typo={typo} />
          <MiniKpi label="Pendiente" value={fmtNum(row.qty_pending)}  color={TOKENS.colors.warning}    typo={typo} />
        </div>
      </div>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
    </button>
  )
}

function MiniKpi({ label, value, color, typo }) {
  return (
    <div>
      <span style={{ ...typo.caption, color: TOKENS.colors.textLow, fontSize: 10 }}>{label}</span>
      <span style={{ ...typo.caption, color, fontWeight: 700, marginLeft: 4 }}>{value}</span>
    </div>
  )
}

function CaptureForm({ selected, qtyReceived, setQtyReceived, notes, setNotes, canSave, saving, onSave, onCancel, typo }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 8 }}>
      <div style={{
        padding: 14, borderRadius: TOKENS.radius.lg,
        background: TOKENS.glass.hero, border: `1px solid ${TOKENS.colors.borderBlue}`,
      }}>
        <p style={{ ...typo.overline, color: TOKENS.colors.textLow, margin: 0 }}>{selected.family} · {selected.state_label}</p>
        <p style={{ ...typo.title, color: TOKENS.colors.text, margin: 0, marginTop: 4 }}>{selected.product_name}</p>
        <div style={{ display: 'flex', gap: 14, marginTop: 8 }}>
          <StatCol label="Producido" value={fmtNum(selected.qty_reported)} typo={typo} />
          <StatCol label="Recibido" value={fmtNum(selected.qty_received)} typo={typo} />
          <StatCol label="Pendiente" value={fmtNum(selected.qty_pending)} accent={TOKENS.colors.warning} typo={typo} />
        </div>
      </div>

      <div>
        <label style={{ ...typo.caption, color: TOKENS.colors.text, display: 'block', marginBottom: 6, fontWeight: 700 }}>
          ¿Cuántas recibiste ahora? (obligatorio)
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => setQtyReceived(String(Math.max(0, (Number(qtyReceived) || 0) - 1)))} style={btnPM}>−</button>
          <input type="number" inputMode="numeric" value={qtyReceived}
            onChange={e => setQtyReceived(e.target.value)}
            placeholder="0"
            style={{ ...inputStyle, flex: 1, textAlign: 'center', fontSize: 24, fontWeight: 700, borderColor: 'rgba(43,143,224,0.3)' }}
          />
          <button onClick={() => setQtyReceived(String((Number(qtyReceived) || 0) + 1))} style={btnPM}>+</button>
        </div>
      </div>

      <div>
        <label style={{ ...typo.caption, color: TOKENS.colors.textMuted, display: 'block', marginBottom: 6 }}>
          Notas (opcional)
        </label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="Observaciones..."
          rows={2}
          style={{ ...inputStyle, resize: 'vertical', minHeight: 56 }}
        />
      </div>

      <button onClick={onSave} disabled={!canSave}
        style={{
          width: '100%', padding: '16px', borderRadius: TOKENS.radius.lg,
          background: canSave ? 'linear-gradient(90deg, #15499B, #2B8FE0)' : TOKENS.colors.surface,
          color: canSave ? 'white' : TOKENS.colors.textLow,
          fontSize: 15, fontWeight: 700, opacity: saving ? 0.6 : 1,
          boxShadow: canSave ? '0 10px 24px rgba(21,73,155,0.30)' : 'none',
          cursor: canSave ? 'pointer' : 'not-allowed',
        }}>
        {saving ? 'Guardando...' : 'CONFIRMAR RECEPCIÓN'}
      </button>

      <button onClick={onCancel} style={{
        padding: '10px', color: TOKENS.colors.textMuted, fontSize: 13, fontWeight: 600,
      }}>
        Cancelar
      </button>
    </div>
  )
}

function StatCol({ label, value, accent, typo }) {
  return (
    <div style={{ flex: 1 }}>
      <p style={{ ...typo.caption, color: TOKENS.colors.textLow, margin: 0 }}>{label}</p>
      <p style={{ ...typo.body, color: accent || TOKENS.colors.textSoft, margin: 0, fontWeight: 700, marginTop: 2 }}>{value}</p>
    </div>
  )
}

function EmptyState({ typo, onNext }) {
  return (
    <div style={{
      marginTop: 20, padding: 24, borderRadius: TOKENS.radius.lg,
      background: TOKENS.colors.successSoft, border: '1px solid rgba(34,197,94,0.25)',
      textAlign: 'center',
    }}>
      <p style={{ ...typo.title, color: TOKENS.colors.success, margin: 0 }}>Sin recepciones pendientes</p>
      <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, marginTop: 6 }}>
        Todos los pendientes están recibidos. Puedes continuar con la reconciliación.
      </p>
      <button onClick={onNext} style={{
        marginTop: 14, padding: '10px 20px', borderRadius: TOKENS.radius.pill,
        background: 'linear-gradient(90deg, #15499B, #2B8FE0)', color: 'white',
        fontSize: 13, fontWeight: 700,
      }}>
        Ir a reconciliar
      </button>
    </div>
  )
}

function NextStepHint({ typo, onNext }) {
  return (
    <button onClick={onNext} style={{
      width: '100%', marginTop: 18, padding: '12px 16px',
      borderRadius: TOKENS.radius.md, textAlign: 'left',
      background: TOKENS.glass.panelSoft, border: `1px solid ${TOKENS.colors.border}`,
      display: 'flex', alignItems: 'center', gap: 10,
    }}>
      <div style={{ flex: 1 }}>
        <p style={{ ...typo.caption, color: TOKENS.colors.textLow, margin: 0 }}>SIGUIENTE PASO</p>
        <p style={{ ...typo.body, color: TOKENS.colors.text, margin: 0, fontWeight: 600, marginTop: 2 }}>
          Al terminar, reconcilia el turno
        </p>
      </div>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
    </button>
  )
}

// ── Styles ───────────────────────────────────────────────────────────────────

const iconBtn = {
  width: 38, height: 38, borderRadius: TOKENS.radius.md,
  background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
}
const bannerLive = {
  padding: 10, borderRadius: TOKENS.radius.md, marginBottom: 12,
  background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.18)',
  display: 'flex', alignItems: 'center', gap: 8,
}
const errorBox = {
  padding: 10, borderRadius: TOKENS.radius.md, marginBottom: 12,
  background: TOKENS.colors.errorSoft, border: `1px solid ${TOKENS.colors.error}40`,
}
const successBox = {
  padding: 10, borderRadius: TOKENS.radius.md, marginBottom: 12,
  background: TOKENS.colors.successSoft, border: '1px solid rgba(34,197,94,0.25)',
  textAlign: 'center',
}
const inputStyle = {
  width: '100%', padding: '10px 12px', borderRadius: 14,
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
  color: 'white', fontSize: 15, fontWeight: 600, outline: 'none',
}
const btnPM = {
  width: 48, height: 48, borderRadius: 14,
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
  color: 'rgba(255,255,255,0.7)', fontSize: 22, fontWeight: 600,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  cursor: 'pointer',
}
