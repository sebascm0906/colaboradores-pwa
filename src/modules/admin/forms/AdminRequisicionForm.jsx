// ─── AdminRequisicionForm — crear requisición V2 (purchase.order draft) ────
// Backend: `gf_pwa_admin.requisition-create` (Sebastián, 2026-04-10).
// Payload:
//   { company_id, name, lines: [{product_id, quantity}],
//     analytic_distribution, warehouse_id, notes }
//
// Diferencias vs ScreenRequisiciones mobile:
//   - Razón social viene del AdminContext (top bar), no pills locales.
//   - Líneas usan ProductPicker real (product_id + quantity) — el backend
//     ya no acepta product_name suelto.
//   - Incluye AnalyticAccountPicker — la distribución se aplica a cada línea.
//   - Muestra la lista de requisiciones recientes filtradas por company.
import { useEffect, useMemo, useState } from 'react'
import { TOKENS } from '../../../tokens'
import { useAdmin } from '../AdminContext'
import {
  createRequisition,
  BACKEND_CAPS,
  filterByCompany,
} from '../adminService'
import { getRequisitions } from '../api'
import AnalyticAccountPicker from '../components/AnalyticAccountPicker'
import ProductPicker from '../components/ProductPicker'
import RequisitionDetailModal from '../components/RequisitionDetailModal'

const fmt = (n) => '$' + Number(n || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

const STATUS_MAP = {
  draft: { label: 'Borrador', tone: 'muted' },
  sent: { label: 'Enviado', tone: 'blue' },
  purchase: { label: 'Confirmado', tone: 'blue' },
  done: { label: 'Completado', tone: 'success' },
  cancel: { label: 'Cancelado', tone: 'error' },
}

function emptyLine() {
  return { product: null, qty: 1, notes: '' }
}

export default function AdminRequisicionForm() {
  const { companyId, companyLabel, warehouseId, sucursal } = useAdmin()

  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Form
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState([emptyLine()])
  const [analyticDistribution, setAnalyticDistribution] = useState(null)

  // Detail modal
  const [detailId, setDetailId] = useState(null)

  const filtered = useMemo(() => filterByCompany(list, companyId), [list, companyId])

  useEffect(() => {
    loadRequisitions()
    setAnalyticDistribution(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, warehouseId])

  async function loadRequisitions() {
    setLoading(true)
    try {
      // Sprint 4: endpoint ahora acepta filtros; pedimos solo las de la razón
      // social activa cuando el backend lo soporta.
      const data = BACKEND_CAPS.serverSideCompanyFilter
        ? await getRequisitions({ companyId, limit: 50 })
        : await getRequisitions()
      const rows = data?.data ?? data
      setList(Array.isArray(rows) ? rows : (Array.isArray(rows?.items) ? rows.items : []))
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }

  function addLine() {
    setLines(prev => [...prev, emptyLine()])
  }
  function updateLine(i, patch) {
    setLines(prev => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  }
  function removeLine(i) {
    if (lines.length <= 1) return
    setLines(prev => prev.filter((_, idx) => idx !== i))
  }

  function validate() {
    if (!title.trim()) return 'Ingresa un título para la requisición'
    if (!companyId) return 'Selecciona una razón social'
    const validLines = lines.filter(l => l.product && Number(l.qty) > 0)
    if (validLines.length === 0) return 'Agrega al menos un producto con cantidad'
    if (BACKEND_CAPS.requisitionAnalytics && !analyticDistribution) {
      return 'Selecciona la cuenta analítica'
    }
    return null
  }

  async function handleSubmit() {
    const errMsg = validate()
    if (errMsg) { setError(errMsg); return }

    setSubmitting(true)
    setError('')
    setSuccess('')
    try {
      const validLines = lines
        .filter(l => l.product && Number(l.qty) > 0)
        .map(l => ({
          product_id: l.product.id,
          quantity: Number(l.qty),
          notes: l.notes?.trim() || undefined,
        }))

      await createRequisition({
        name: title.trim(),
        company_id: companyId,
        warehouse_id: warehouseId || undefined,
        sucursal_code: sucursal || undefined,
        notes: notes.trim() || undefined,
        lines: validLines,
        analytic_distribution: analyticDistribution,
      })

      setSuccess(`Requisición creada en ${companyLabel}`)
      setTitle('')
      setNotes('')
      setLines([emptyLine()])
      setAnalyticDistribution(null)
      await loadRequisitions()
      setTimeout(() => setSuccess(''), 3500)
    } catch (e) {
      setError(e?.message || 'Error al crear requisición')
    } finally {
      setSubmitting(false)
    }
  }

  const inputStyle = {
    width: '100%', padding: '10px 14px',
    borderRadius: TOKENS.radius.md,
    background: TOKENS.colors.surface,
    border: `1px solid ${TOKENS.colors.border}`,
    color: TOKENS.colors.text, fontSize: 14, outline: 'none',
    fontFamily: "'DM Sans', sans-serif",
  }

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <p style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.18em',
          color: TOKENS.colors.textLow, margin: 0,
        }}>
          REQUISICIONES · {companyLabel.toUpperCase()}
        </p>
        <h1 style={{
          fontSize: 26, fontWeight: 700, letterSpacing: '-0.03em',
          color: TOKENS.colors.text, margin: '4px 0 0',
        }}>
          Crear requisición
        </h1>
      </div>

      {error && (
        <div style={{
          padding: '10px 14px', borderRadius: TOKENS.radius.sm, marginBottom: 12,
          background: TOKENS.colors.errorSoft, border: `1px solid ${TOKENS.colors.error}40`,
          fontSize: 12, fontWeight: 600, color: TOKENS.colors.error,
        }}>
          {error}
        </div>
      )}
      {success && (
        <div style={{
          padding: '10px 14px', borderRadius: TOKENS.radius.sm, marginBottom: 12,
          background: TOKENS.colors.successSoft, border: `1px solid ${TOKENS.colors.success}40`,
          fontSize: 12, fontWeight: 600, color: TOKENS.colors.success,
        }}>
          {success}
        </div>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)',
        gap: 20,
      }}>
        {/* Form */}
        <div style={{
          padding: 22, borderRadius: TOKENS.radius.xl,
          background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
        }}>
          <p style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.18em',
            color: TOKENS.colors.textLow, marginTop: 0, marginBottom: 16,
          }}>
            NUEVA REQUISICIÓN
          </p>

          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 12px', borderRadius: TOKENS.radius.md,
            background: TOKENS.colors.blueGlow,
            border: `1px solid ${TOKENS.colors.borderBlue}`,
            marginBottom: 16,
          }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: TOKENS.colors.blue3 }} />
            <span style={{ fontSize: 12, color: TOKENS.colors.textSoft }}>
              La requisición se creará como <strong style={{ color: TOKENS.colors.text }}>borrador</strong> en {companyLabel}
              {sucursal && <> · {sucursal}</>}
            </span>
          </div>

          <label style={{ fontSize: 12, color: TOKENS.colors.textMuted, display: 'block', marginBottom: 4 }}>
            Título *
          </label>
          <input
            type="text" placeholder="Ej: Material de limpieza semanal"
            value={title} onChange={e => setTitle(e.target.value)}
            style={{ ...inputStyle, marginBottom: 14 }}
          />

          <label style={{ fontSize: 12, color: TOKENS.colors.textMuted, display: 'block', marginBottom: 6 }}>
            Productos *
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
            {lines.map((line, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <ProductPicker
                  value={line.product}
                  onChange={(p) => updateLine(i, { product: p })}
                  warehouseId={warehouseId}
                  placeholder={`Producto ${i + 1}`}
                />
                <input
                  type="number" min="0.01" step="0.01"
                  value={line.qty}
                  onChange={e => updateLine(i, { qty: e.target.value })}
                  style={{ ...inputStyle, width: 90, textAlign: 'center', padding: '9px 8px' }}
                />
                <button
                  type="button"
                  onClick={() => removeLine(i)}
                  disabled={lines.length <= 1}
                  style={{
                    width: 38, height: 38, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderRadius: TOKENS.radius.md,
                    background: 'transparent',
                    border: `1px solid ${TOKENS.colors.border}`,
                    color: lines.length <= 1 ? TOKENS.colors.textLow : TOKENS.colors.error,
                    cursor: lines.length <= 1 ? 'not-allowed' : 'pointer',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addLine}
            style={{
              width: '100%', padding: '9px 0', borderRadius: TOKENS.radius.md,
              background: `${TOKENS.colors.blue2}12`, border: `1px dashed ${TOKENS.colors.blue2}40`,
              marginBottom: 14, fontSize: 12, fontWeight: 600,
              color: TOKENS.colors.blue3, fontFamily: "'DM Sans', sans-serif",
            }}
          >
            + Agregar producto
          </button>

          {/* Analítica */}
          <div style={{
            padding: 14, borderRadius: TOKENS.radius.md,
            background: TOKENS.colors.surfaceSoft,
            border: `1px solid ${TOKENS.colors.border}`,
            marginBottom: 14,
          }}>
            <p style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.18em',
              color: TOKENS.colors.textLow, margin: '0 0 10px',
            }}>
              CLASIFICACIÓN ANALÍTICA · {companyLabel.toUpperCase()}
            </p>
            <AnalyticAccountPicker
              value={analyticDistribution}
              onChange={setAnalyticDistribution}
              companyId={companyId}
              required={BACKEND_CAPS.requisitionAnalytics}
              label="Cuenta analítica (aplica a todas las líneas)"
            />
          </div>

          <label style={{ fontSize: 12, color: TOKENS.colors.textMuted, display: 'block', marginBottom: 4 }}>
            Notas (opcional)
          </label>
          <textarea
            placeholder="Urgencia, justificación, proveedor sugerido…"
            rows={3}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            style={{ ...inputStyle, resize: 'vertical', marginBottom: 14 }}
          />

          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            style={{
              width: '100%', padding: '14px 0', borderRadius: TOKENS.radius.md,
              background: `linear-gradient(135deg, ${TOKENS.colors.blue}, ${TOKENS.colors.blue2})`,
              opacity: submitting ? 0.6 : 1, cursor: submitting ? 'wait' : 'pointer',
              color: 'white', fontSize: 14, fontWeight: 700,
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            {submitting ? 'Creando…' : 'Crear requisición'}
          </button>
        </div>

        {/* Lista */}
        <div>
          <p style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.18em',
            color: TOKENS.colors.textLow, margin: '0 0 12px',
          }}>
            REQUISICIONES RECIENTES · {companyLabel.toUpperCase()}
          </p>

          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 30 }}>
              <div style={{
                width: 24, height: 24, border: '2px solid rgba(255,255,255,0.12)',
                borderTop: '2px solid #2B8FE0', borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }} />
            </div>
          ) : filtered.length === 0 ? (
            <div style={{
              padding: '24px 20px', borderRadius: TOKENS.radius.lg, textAlign: 'center',
              background: TOKENS.glass.panelSoft, border: `1px dashed ${TOKENS.colors.border}`,
            }}>
              <p style={{ fontSize: 13, color: TOKENS.colors.textMuted, margin: 0 }}>
                Sin requisiciones en esta razón social
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filtered.map((req, i) => {
                const st = STATUS_MAP[req.state] || STATUS_MAP.draft
                const toneColor =
                  st.tone === 'success' ? TOKENS.colors.success :
                  st.tone === 'error' ? TOKENS.colors.error :
                  st.tone === 'blue' ? TOKENS.colors.blue3 :
                  TOKENS.colors.textMuted
                const clickable = req.id != null && BACKEND_CAPS.requisitionDetail
                return (
                  <div
                    key={req.id || i}
                    role={clickable ? 'button' : undefined}
                    tabIndex={clickable ? 0 : undefined}
                    onClick={() => clickable && setDetailId(req.id)}
                    onKeyDown={e => {
                      if (!clickable) return
                      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDetailId(req.id) }
                    }}
                    style={{
                      padding: '12px 14px', borderRadius: TOKENS.radius.md,
                      background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
                      display: 'flex', alignItems: 'center', gap: 10,
                      cursor: clickable ? 'pointer' : 'default',
                      transition: 'border-color 0.15s ease',
                    }}
                    onMouseEnter={e => { if (clickable) e.currentTarget.style.borderColor = TOKENS.colors.blue2 }}
                    onMouseLeave={e => { if (clickable) e.currentTarget.style.borderColor = TOKENS.colors.border }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{
                        fontSize: 13, fontWeight: 600, color: TOKENS.colors.text,
                        margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {req.name || req.partner_ref || `Requisición #${req.id}`}
                      </p>
                      <p style={{ fontSize: 11, color: TOKENS.colors.textMuted, margin: 0, marginTop: 2 }}>
                        {req.date_order
                          ? new Date(req.date_order).toLocaleDateString('es-MX')
                          : req.date
                            ? new Date(req.date).toLocaleDateString('es-MX')
                            : ''}
                        {req.line_count != null && ` · ${req.line_count} líneas`}
                      </p>
                    </div>
                    {req.amount_total != null && (
                      <span style={{ fontSize: 13, fontWeight: 700, color: TOKENS.colors.blue3 }}>
                        {fmt(req.amount_total)}
                      </span>
                    )}
                    <div style={{
                      padding: '3px 8px', borderRadius: TOKENS.radius.pill,
                      background: `${toneColor}15`, border: `1px solid ${toneColor}30`,
                    }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: toneColor }}>
                        {st.label}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <div style={{ height: 40 }} />

      {detailId && (
        <RequisitionDetailModal
          requisitionId={detailId}
          onClose={() => setDetailId(null)}
          onCancelled={() => { loadRequisitions() }}
        />
      )}
    </div>
  )
}
