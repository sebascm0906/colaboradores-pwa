// ─── ScreenGastosHistorial — entrada responsive al historial de gastos ────
// Desktop (≥1024px) usa AdminShell + AdminHistorialGastosView (V2).
// Mobile conserva la pantalla legacy como fallback.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../App'
import { COMPANY_LABELS, TOKENS, getCompaniesForSucursal, getTypo } from '../../tokens'
import { getExpensesHistory } from './api'
import { AdminProvider } from './AdminContext'
import AdminShell from './components/AdminShell'
import AdminHistorialGastosView from './views/AdminHistorialGastosView'

export default function ScreenGastosHistorial() {
  const [sw, setSw] = useState(typeof window !== 'undefined' ? window.innerWidth : 1280)

  useEffect(() => {
    const handler = () => setSw(window.innerWidth)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  if (sw < 1024) return <MobileHistorialGastos />

  return (
    <AdminProvider>
      <AdminShell activeBlock="gastos-hist" title="Historial de gastos">
        <AdminHistorialGastosView />
      </AdminShell>
    </AdminProvider>
  )
}

const STATE_MAP = {
  draft: { label: 'Borrador', color: TOKENS.colors.textMuted },
  reported: { label: 'Reportado', color: TOKENS.colors.warning },
  submitted: { label: 'Enviado', color: TOKENS.colors.blue2 },
  approved: { label: 'Aprobado', color: TOKENS.colors.success },
  done: { label: 'Hecho', color: TOKENS.colors.success },
  refused: { label: 'Rechazado', color: TOKENS.colors.error },
}

function parseTag(label, text) {
  if (!text) return ''
  const match = text.match(new RegExp(`\\[${label}:\\s*([^\\]]+)\\]`, 'i'))
  return match ? match[1].trim() : ''
}

function formatCurrency(value) {
  const num = Number(value || 0)
  return `$${num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`
}

function getLocalISODate(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

function formatHistoryDate(value) {
  if (!value) return '—'
  const [year, month, day] = String(value).split('-')
  if (!year || !month || !day) return String(value)
  return new Date(`${year}-${month}-${day}T12:00:00`).toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function MobileHistorialGastos() {
  const { session } = useSession()
  const navigate = useNavigate()
  const [sw, setSw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])

  const companies = useMemo(() => getCompaniesForSucursal(session?.sucursal), [session?.sucursal])
  const today = useMemo(() => getLocalISODate(), [])
  const initialCompanyId = session?.company_id || companies[0]?.id || null

  const [draftFilters, setDraftFilters] = useState({
    companyId: initialCompanyId,
    dateFrom: today,
    dateTo: today,
    capturer: '',
    stateFilter: '',
    query: '',
  })
  const [appliedFilters, setAppliedFilters] = useState({
    companyId: initialCompanyId,
    dateFrom: today,
    dateTo: today,
    capturer: '',
    stateFilter: '',
    query: '',
  })

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [items, setItems] = useState([])
  const requestSeq = useRef(0)

  useEffect(() => {
    const handler = () => setSw(window.innerWidth)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  const loadHistory = useCallback(async (filters) => {
    const requestId = ++requestSeq.current
    setLoading(true)
    setError('')
    try {
      const payload = await getExpensesHistory({
        company_id: filters.companyId || undefined,
        date_from: filters.dateFrom || undefined,
        date_to: filters.dateTo || undefined,
        capturer: filters.capturer || undefined,
        state: filters.stateFilter || undefined,
        q: filters.query || undefined,
      })
      if (requestId !== requestSeq.current) return
      const rows = Array.isArray(payload?.items)
        ? payload.items
        : Array.isArray(payload)
          ? payload
          : []
      setItems(rows)
    } catch (err) {
      if (requestId !== requestSeq.current) return
      setItems([])
      setError(err?.message || 'Error al cargar gastos')
    } finally {
      if (requestId === requestSeq.current) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    loadHistory(appliedFilters)
  }, [appliedFilters, loadHistory])

  const filteredItems = useMemo(() => {
    return items.map((row) => ({
      ...row,
      capturista: row.employee_name || parseTag('Capturó', row.description || '') || parseTag('Capturo', row.description || ''),
      sucursal: parseTag('Sucursal', row.description || ''),
    }))
  }, [items])

  const totalAmount = filteredItems.reduce((sum, row) => sum + Number(row.total_amount || 0), 0)
  const companyLabel = COMPANY_LABELS[appliedFilters.companyId] || companies.find((c) => c.id === appliedFilters.companyId)?.name || 'Empresa'

  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: TOKENS.radius.md,
    background: TOKENS.colors.surface,
    border: `1px solid ${TOKENS.colors.border}`,
    color: TOKENS.colors.text,
    fontSize: typo.body.fontSize,
    outline: 'none',
    fontFamily: "'DM Sans', sans-serif",
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
        input, select { font-family: 'DM Sans', sans-serif; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 20, paddingBottom: 12 }}>
          <button onClick={() => navigate('/admin')} style={{
            width: 38, height: 38, borderRadius: TOKENS.radius.md,
            background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
            </svg>
          </button>
          <span style={{ ...typo.title, color: TOKENS.colors.textSoft }}>Historial de Gastos</span>
        </div>

        {error && (
          <div style={{ padding: '10px 14px', borderRadius: TOKENS.radius.sm, background: TOKENS.colors.errorSoft, border: `1px solid ${TOKENS.colors.error}40`, marginBottom: 12 }}>
            <span style={{ ...typo.caption, color: TOKENS.colors.error }}>{error}</span>
          </div>
        )}

        <div style={{
          padding: 18, borderRadius: TOKENS.radius.xl,
          background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
          marginBottom: 18,
        }}>
          <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginTop: 0, marginBottom: 14 }}>FILTROS</p>

          <label style={{ ...typo.caption, color: TOKENS.colors.textMuted, display: 'block', marginBottom: 4 }}>Empresa / Sucursal</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
            {companies.map((co) => (
              <button key={co.id} onClick={() => setDraftFilters((current) => ({ ...current, companyId: co.id }))} style={{
                padding: '8px 14px', borderRadius: TOKENS.radius.pill,
                background: draftFilters.companyId === co.id ? `${TOKENS.colors.blue2}22` : TOKENS.colors.surface,
                border: `1px solid ${draftFilters.companyId === co.id ? TOKENS.colors.blue2 : TOKENS.colors.border}`,
                color: draftFilters.companyId === co.id ? TOKENS.colors.blue3 : TOKENS.colors.textMuted,
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}>
                {co.name}
              </button>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div>
              <label style={{ ...typo.caption, color: TOKENS.colors.textMuted, display: 'block', marginBottom: 4 }}>Desde</label>
              <input type="date" value={draftFilters.dateFrom} onChange={(e) => setDraftFilters((current) => ({ ...current, dateFrom: e.target.value }))} style={{ ...inputStyle, colorScheme: 'dark' }} />
            </div>
            <div>
              <label style={{ ...typo.caption, color: TOKENS.colors.textMuted, display: 'block', marginBottom: 4 }}>Hasta</label>
              <input type="date" value={draftFilters.dateTo} onChange={(e) => setDraftFilters((current) => ({ ...current, dateTo: e.target.value }))} style={{ ...inputStyle, colorScheme: 'dark' }} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div>
              <label style={{ ...typo.caption, color: TOKENS.colors.textMuted, display: 'block', marginBottom: 4 }}>Capturista</label>
              <input
                type="text"
                value={draftFilters.capturer}
                onChange={(e) => setDraftFilters((current) => ({ ...current, capturer: e.target.value }))}
                placeholder="Nombre del capturista"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={{ ...typo.caption, color: TOKENS.colors.textMuted, display: 'block', marginBottom: 4 }}>Estado</label>
              <select value={draftFilters.stateFilter} onChange={(e) => setDraftFilters((current) => ({ ...current, stateFilter: e.target.value }))} style={inputStyle}>
                <option value="">Todos</option>
                {Object.entries(STATE_MAP).map(([key, cfg]) => (
                  <option key={key} value={key}>{cfg.label}</option>
                ))}
              </select>
            </div>
          </div>

          <label style={{ ...typo.caption, color: TOKENS.colors.textMuted, display: 'block', marginBottom: 4 }}>Buscar</label>
          <input
            type="text"
            value={draftFilters.query}
            onChange={(e) => setDraftFilters((current) => ({ ...current, query: e.target.value }))}
            placeholder="Descripcion o notas"
            style={{ ...inputStyle, marginBottom: 12 }}
          />

          <button onClick={() => setAppliedFilters({ ...draftFilters })} style={{
            width: '100%', padding: '12px 0', borderRadius: TOKENS.radius.md,
            background: `linear-gradient(135deg, ${TOKENS.colors.blue}, ${TOKENS.colors.blue2})`,
          }}>
            <span style={{ ...typo.body, color: 'white', fontWeight: 700 }}>Aplicar filtros</span>
          </button>
        </div>

        <div style={{
          padding: 16, borderRadius: TOKENS.radius.xl,
          background: TOKENS.glass.hero, border: `1px solid ${TOKENS.colors.borderBlue}`,
          boxShadow: `${TOKENS.shadow.md}, ${TOKENS.shadow.inset}`, marginBottom: 16,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0 }}>Sucursal</p>
              <p style={{ ...typo.title, color: TOKENS.colors.textSoft, margin: 0, marginTop: 4 }}>{companyLabel}</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0 }}>Gastos</p>
              <p style={{ ...typo.title, color: TOKENS.colors.warning, margin: 0, marginTop: 4 }}>{filteredItems.length}</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0 }}>Total</p>
              <p style={{ ...typo.title, color: TOKENS.colors.blue3, margin: 0, marginTop: 4 }}>{formatCurrency(totalAmount)}</p>
            </div>
          </div>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 40 }}>
            <div style={{ width: 28, height: 28, border: '2px solid rgba(255,255,255,0.12)', borderTop: '2px solid #2B8FE0', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : filteredItems.length === 0 ? (
          <div style={{
            padding: 22, borderRadius: TOKENS.radius.lg, textAlign: 'center',
            background: TOKENS.colors.surfaceSoft, border: `1px solid ${TOKENS.colors.border}`,
          }}>
            <p style={{ ...typo.body, color: TOKENS.colors.textMuted, margin: 0 }}>Sin gastos registrados</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28 }}>
            {filteredItems.map((row, i) => {
              const st = STATE_MAP[row.state] || STATE_MAP.draft
              const dateLabel = formatHistoryDate(row.date)
              const rowCompany = row.company_name || COMPANY_LABELS[row.company_id] || companies.find((c) => c.id === row.company_id)?.name || 'Empresa'
              return (
                <div key={row.id || i} style={{
                  padding: 14, borderRadius: TOKENS.radius.lg,
                  background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <p style={{ ...typo.caption, color: TOKENS.colors.textSoft, margin: 0, fontWeight: 600 }}>{row.name || 'Gasto'}</p>
                      <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, marginTop: 2 }}>{rowCompany}{row.sucursal ? ` • ${row.sucursal}` : ''}</p>
                      <p style={{ ...typo.caption, color: TOKENS.colors.textLow, margin: 0, marginTop: 2 }}>{dateLabel}</p>
                      {row.capturista && (
                        <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, marginTop: 2 }}>Capturó: {row.capturista}</p>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: TOKENS.colors.warning }}>{formatCurrency(row.total_amount)}</span>
                      <span style={{
                        padding: '3px 8px', borderRadius: TOKENS.radius.pill,
                        background: `${st.color}15`, border: `1px solid ${st.color}30`,
                        fontSize: 10, fontWeight: 700, color: st.color,
                      }}>
                        {st.label}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
