// ─── AdminHistorialGastosView — historial de gastos desktop V2 ─────────────
// Backend: `gf_pwa_admin.expenses-history` (Sebastián, 2026-04-10).
// Filtros server-side: company_id, warehouse_id, employee_id, date_from,
// date_to, state, limit, offset.
//
// La razón social activa viene del AdminContext (top bar). Los demás
// filtros están controlados localmente.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { TOKENS } from '../../../tokens'
import { useAdmin } from '../AdminContext'
import { getExpensesHistory } from '../api'

const STATE_MAP = {
  draft:     { label: 'Borrador',  color: 'muted' },
  reported:  { label: 'Reportado', color: 'warning' },
  submitted: { label: 'Enviado',   color: 'blue' },
  approved:  { label: 'Aprobado',  color: 'success' },
  done:      { label: 'Hecho',     color: 'success' },
  refused:   { label: 'Rechazado', color: 'error' },
}

const PAGE_SIZE = 25

const fmt = (n) => '$' + Number(n || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

function toISODate(d = new Date()) {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

function formatDate(value) {
  if (!value) return '—'
  const [y, m, d] = String(value).split('-')
  if (!y || !m || !d) return String(value)
  return new Date(`${y}-${m}-${d}T12:00:00`).toLocaleDateString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

function toneColor(tone) {
  switch (tone) {
    case 'success': return TOKENS.colors.success
    case 'warning': return TOKENS.colors.warning
    case 'error':   return TOKENS.colors.error
    case 'blue':    return TOKENS.colors.blue3
    default:        return TOKENS.colors.textMuted
  }
}

export default function AdminHistorialGastosView() {
  const { companyId, companyLabel, warehouseId, employeeId } = useAdmin()

  const today = useMemo(() => toISODate(), [])
  const firstOfMonth = useMemo(() => {
    const d = new Date()
    return toISODate(new Date(d.getFullYear(), d.getMonth(), 1))
  }, [])

  const [draft, setDraft] = useState({
    dateFrom: firstOfMonth,
    dateTo: today,
    state: '',
    onlyMine: false,
    warehouseScope: 'all', // 'all' | 'mine'
  })
  const [applied, setApplied] = useState({ ...draft })
  const [page, setPage] = useState(0)

  const [rows, setRows] = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const seqRef = useRef(0)

  const load = useCallback(async () => {
    const seq = ++seqRef.current
    setLoading(true)
    setErr('')
    try {
      const res = await getExpensesHistory({
        companyId,
        warehouseId: applied.warehouseScope === 'mine' ? warehouseId : undefined,
        employeeId: applied.onlyMine ? employeeId : undefined,
        dateFrom: applied.dateFrom || undefined,
        dateTo: applied.dateTo || undefined,
        state: applied.state || undefined,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      })
      if (seq !== seqRef.current) return
      const data = res?.data ?? res
      const items = Array.isArray(data?.items)
        ? data.items
        : Array.isArray(data)
          ? data
          : []
      setRows(items)
      const count = Number(data?.total ?? data?.count ?? items.length)
      setTotalCount(Number.isFinite(count) ? count : items.length)
    } catch (e) {
      if (seq !== seqRef.current) return
      setRows([])
      setTotalCount(0)
      setErr(e?.message || 'Error al cargar historial')
    } finally {
      if (seq === seqRef.current) setLoading(false)
    }
  }, [applied, page, companyId, warehouseId, employeeId])

  useEffect(() => { load() }, [load])

  // Al cambiar company, reset paginación
  useEffect(() => { setPage(0) }, [companyId])

  const total = useMemo(
    () => rows.reduce((sum, r) => sum + Number(r.total_amount || r.unit_amount || 0), 0),
    [rows],
  )

  function applyFilters() {
    setPage(0)
    setApplied({ ...draft })
  }
  function resetFilters() {
    const fresh = { dateFrom: firstOfMonth, dateTo: today, state: '', onlyMine: false, warehouseScope: 'all' }
    setDraft(fresh)
    setApplied(fresh)
    setPage(0)
  }

  const inputStyle = {
    width: '100%', padding: '9px 12px', borderRadius: TOKENS.radius.md,
    background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
    color: TOKENS.colors.text, fontSize: 13, outline: 'none',
    fontFamily: "'DM Sans', sans-serif",
  }

  const hasMore = (page + 1) * PAGE_SIZE < totalCount

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <p style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.18em',
          color: TOKENS.colors.textLow, margin: 0,
        }}>
          HISTORIAL · {companyLabel.toUpperCase()}
        </p>
        <h1 style={{
          fontSize: 26, fontWeight: 700, letterSpacing: '-0.03em',
          color: TOKENS.colors.text, margin: '4px 0 0',
        }}>
          Historial de gastos
        </h1>
      </div>

      {/* KPIs del periodo */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))',
        gap: 12, marginBottom: 16,
      }}>
        <KpiCard label="Gastos" value={String(totalCount || rows.length)} tone={TOKENS.colors.warning} />
        <KpiCard label="Total" value={fmt(total)} tone={TOKENS.colors.blue3} />
        <KpiCard label="Rango" value={`${formatDate(applied.dateFrom)} → ${formatDate(applied.dateTo)}`} tone={TOKENS.colors.textSoft} small />
      </div>

      {/* Filtros */}
      <div style={{
        padding: 18, borderRadius: TOKENS.radius.xl, marginBottom: 18,
        background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
      }}>
        <p style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.18em',
          color: TOKENS.colors.textLow, marginTop: 0, marginBottom: 14,
        }}>
          FILTROS
        </p>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 12, marginBottom: 12,
        }}>
          <div>
            <label style={{ fontSize: 11, color: TOKENS.colors.textMuted, display: 'block', marginBottom: 4 }}>
              Desde
            </label>
            <input
              type="date" value={draft.dateFrom}
              onChange={e => setDraft(d => ({ ...d, dateFrom: e.target.value }))}
              style={{ ...inputStyle, colorScheme: 'dark' }}
            />
          </div>
          <div>
            <label style={{ fontSize: 11, color: TOKENS.colors.textMuted, display: 'block', marginBottom: 4 }}>
              Hasta
            </label>
            <input
              type="date" value={draft.dateTo}
              onChange={e => setDraft(d => ({ ...d, dateTo: e.target.value }))}
              style={{ ...inputStyle, colorScheme: 'dark' }}
            />
          </div>
          <div>
            <label style={{ fontSize: 11, color: TOKENS.colors.textMuted, display: 'block', marginBottom: 4 }}>
              Estado
            </label>
            <select
              value={draft.state}
              onChange={e => setDraft(d => ({ ...d, state: e.target.value }))}
              style={inputStyle}
            >
              <option value="">Todos</option>
              {Object.entries(STATE_MAP).map(([key, cfg]) => (
                <option key={key} value={key}>{cfg.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, color: TOKENS.colors.textMuted, display: 'block', marginBottom: 4 }}>
              Alcance
            </label>
            <select
              value={draft.warehouseScope}
              onChange={e => setDraft(d => ({ ...d, warehouseScope: e.target.value }))}
              style={inputStyle}
            >
              <option value="all">Toda la razón social</option>
              <option value="mine">Solo mi sucursal</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: TOKENS.colors.textMuted, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={draft.onlyMine}
              onChange={e => setDraft(d => ({ ...d, onlyMine: e.target.checked }))}
              style={{ accentColor: TOKENS.colors.blue3 }}
            />
            Solo mis gastos
          </label>

          <div style={{ flex: 1 }} />

          <button
            type="button"
            onClick={resetFilters}
            style={{
              padding: '9px 16px', borderRadius: TOKENS.radius.md,
              background: 'transparent', border: `1px solid ${TOKENS.colors.border}`,
              color: TOKENS.colors.textMuted, fontSize: 12, fontWeight: 600,
              fontFamily: "'DM Sans', sans-serif", cursor: 'pointer',
            }}
          >
            Limpiar
          </button>
          <button
            type="button"
            onClick={applyFilters}
            style={{
              padding: '9px 20px', borderRadius: TOKENS.radius.md,
              background: `linear-gradient(135deg, ${TOKENS.colors.blue}, ${TOKENS.colors.blue2})`,
              color: 'white', fontSize: 12, fontWeight: 700,
              fontFamily: "'DM Sans', sans-serif", cursor: 'pointer', border: 'none',
            }}
          >
            Aplicar filtros
          </button>
        </div>
      </div>

      {err && (
        <div style={{
          padding: '10px 14px', borderRadius: TOKENS.radius.sm, marginBottom: 12,
          background: TOKENS.colors.errorSoft, border: `1px solid ${TOKENS.colors.error}40`,
          fontSize: 12, fontWeight: 600, color: TOKENS.colors.error,
        }}>
          {err}
        </div>
      )}

      {/* Tabla */}
      <div style={{
        borderRadius: TOKENS.radius.xl, overflow: 'hidden',
        background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '90px minmax(0, 2fr) 1fr 120px 100px',
          gap: 10, padding: '12px 18px',
          borderBottom: `1px solid ${TOKENS.colors.border}`,
          fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
          color: TOKENS.colors.textLow, textTransform: 'uppercase',
        }}>
          <div>Fecha</div>
          <div>Descripción</div>
          <div>Capturista</div>
          <div style={{ textAlign: 'right' }}>Monto</div>
          <div style={{ textAlign: 'center' }}>Estado</div>
        </div>

        {loading ? (
          <div style={{ padding: '40px 0', display: 'flex', justifyContent: 'center' }}>
            <div style={{
              width: 28, height: 28, border: '2px solid rgba(255,255,255,0.12)',
              borderTop: '2px solid #2B8FE0', borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }} />
          </div>
        ) : rows.length === 0 ? (
          <div style={{ padding: '40px 20px', textAlign: 'center' }}>
            <p style={{ fontSize: 13, color: TOKENS.colors.textMuted, margin: 0 }}>
              Sin gastos para el rango seleccionado
            </p>
          </div>
        ) : (
          rows.map((row, i) => {
            const st = STATE_MAP[row.state] || STATE_MAP.draft
            const color = toneColor(st.color)
            const monto = Number(row.total_amount ?? row.unit_amount ?? 0)
            const capturista = row.employee_name || row.employee_id?.[1] || ''
            return (
              <div
                key={row.id || i}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '90px minmax(0, 2fr) 1fr 120px 100px',
                  gap: 10, padding: '12px 18px', alignItems: 'center',
                  borderBottom: i < rows.length - 1 ? `1px solid ${TOKENS.colors.border}60` : 'none',
                }}
              >
                <div style={{ fontSize: 11, color: TOKENS.colors.textMuted }}>
                  {formatDate(row.date)}
                </div>
                <div style={{ minWidth: 0 }}>
                  <p style={{
                    margin: 0, fontSize: 13, fontWeight: 600, color: TOKENS.colors.text,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {row.name || row.description || 'Gasto'}
                  </p>
                  {row.reference && (
                    <p style={{ margin: 0, fontSize: 10, color: TOKENS.colors.textLow }}>
                      {row.reference}
                    </p>
                  )}
                </div>
                <div style={{ fontSize: 11, color: TOKENS.colors.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {capturista || '—'}
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: TOKENS.colors.warning, textAlign: 'right' }}>
                  {fmt(monto)}
                </div>
                <div style={{ textAlign: 'center' }}>
                  <span style={{
                    padding: '3px 8px', borderRadius: TOKENS.radius.pill,
                    background: `${color}15`, border: `1px solid ${color}30`,
                    fontSize: 10, fontWeight: 700, color,
                  }}>
                    {st.label}
                  </span>
                </div>
              </div>
            )
          })
        )}

        {/* Paginación */}
        {(totalCount > PAGE_SIZE || page > 0) && (
          <div style={{
            padding: '12px 18px',
            borderTop: `1px solid ${TOKENS.colors.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            fontSize: 11, color: TOKENS.colors.textMuted,
          }}>
            <span>
              {totalCount > 0
                ? `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, totalCount)} de ${totalCount}`
                : `Página ${page + 1}`}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                style={{
                  padding: '6px 12px', borderRadius: TOKENS.radius.sm,
                  background: 'transparent', border: `1px solid ${TOKENS.colors.border}`,
                  color: page === 0 ? TOKENS.colors.textLow : TOKENS.colors.text,
                  fontSize: 11, fontWeight: 600, cursor: page === 0 ? 'not-allowed' : 'pointer',
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                Anterior
              </button>
              <button
                type="button"
                onClick={() => setPage(p => p + 1)}
                disabled={!hasMore}
                style={{
                  padding: '6px 12px', borderRadius: TOKENS.radius.sm,
                  background: 'transparent', border: `1px solid ${TOKENS.colors.border}`,
                  color: !hasMore ? TOKENS.colors.textLow : TOKENS.colors.text,
                  fontSize: 11, fontWeight: 600, cursor: !hasMore ? 'not-allowed' : 'pointer',
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>

      <div style={{ height: 40 }} />
    </div>
  )
}

function KpiCard({ label, value, tone, small = false }) {
  return (
    <div style={{
      padding: 14, borderRadius: TOKENS.radius.lg,
      background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
    }}>
      <p style={{
        fontSize: 10, fontWeight: 700, letterSpacing: '0.14em',
        color: TOKENS.colors.textLow, margin: 0, textTransform: 'uppercase',
      }}>
        {label}
      </p>
      <p style={{
        fontSize: small ? 13 : 22, fontWeight: 700, letterSpacing: '-0.02em',
        color: tone, margin: '6px 0 0',
      }}>
        {value}
      </p>
    </div>
  )
}
