import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { useSession } from '../../App'
import { TOKENS, getTypo } from '../../tokens'
import { getVanRoster, executeVanLoad, getStockAtLocation, getLoadProducts } from './entregasService'
import { ScreenShell, ConfirmDialog, EmptyState } from './components'

// ─────────────────────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────────────────────

function Spinner({ size = 22, color }) {
  return (
    <div style={{
      width: size, height: size,
      border: `2px solid rgba(255,255,255,0.10)`,
      borderTop: `2px solid ${color || TOKENS.colors.blue2}`,
      borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0,
    }} />
  )
}

function VanIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke={TOKENS.colors.blue3} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="3" width="15" height="13" rx="2" />
      <path d="M16 8h4l3 5v3h-7V8z" />
      <circle cx="5.5" cy="18.5" r="2.5" />
      <circle cx="18.5" cy="18.5" r="2.5" />
    </svg>
  )
}

function ChevronIcon({ open }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="rgba(255,255,255,0.35)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

function XIcon({ color = '#ef4444' }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  Section label
// ─────────────────────────────────────────────────────────────────────────────
function SectionLabel({ children, typo }) {
  return (
    <p style={{ ...typo.overline, color: TOKENS.colors.textLow, margin: '14px 0 6px', letterSpacing: '0.08em' }}>
      {children}
    </p>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  Stock row inside van card
// ─────────────────────────────────────────────────────────────────────────────
function StockRow({ product_id, product_name, requested, onHand, typo }) {
  const sufficient = onHand >= requested
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '7px 10px', borderRadius: TOKENS.radius.sm,
      background: sufficient ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)',
      border: `1px solid ${sufficient ? 'rgba(34,197,94,0.18)' : 'rgba(239,68,68,0.30)'}`,
    }}>
      <span style={{
        ...typo.caption, color: TOKENS.colors.textSoft,
        flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {product_name || `Producto ${product_id}`}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, marginLeft: 8 }}>
        <span style={{ fontSize: 11, color: TOKENS.colors.textMuted }}>
          Pide: <strong style={{ color: TOKENS.colors.text }}>{requested}</strong>
        </span>
        <span style={{ fontSize: 11, color: TOKENS.colors.textMuted }}>
          Exist: <strong style={{ color: sufficient ? TOKENS.colors.success : '#ef4444' }}>{onHand}</strong>
        </span>
        <span style={{ fontSize: 13 }}>{sufficient ? '✓' : '⚠'}</span>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  Main component
// ─────────────────────────────────────────────────────────────────────────────
export default function ScreenCargaUnidades() {
  const { session } = useSession()
  const [sw, setSw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])

  // ── Data ──────────────────────────────────────────────────────────────────
  const [vans, setVans] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // ── Expansion ─────────────────────────────────────────────────────────────
  const [expandedId, setExpandedId] = useState(null) // employee_id

  // ── Manual lines per van: { [employee_id]: [{product_id, qty, product_name}] } ──
  const [manualLines, setManualLines] = useState({})

  // ── Product catalog ───────────────────────────────────────────────────────
  const [products, setProducts] = useState([])
  const [productsLoaded, setProductsLoaded] = useState(false)

  // ── Stock check: { [employee_id]: { loading, items:[{product_id,on_hand}], error } } ──
  const [stockCheck, setStockCheck] = useState({})

  // ── Execution ─────────────────────────────────────────────────────────────
  const [executing, setExecuting] = useState(null) // employee_id
  const [confirmVan, setConfirmVan] = useState(null) // van object to confirm
  const [execResults, setExecResults] = useState({}) // { [employee_id]: {ok, message, data} }

  // ── Toast ─────────────────────────────────────────────────────────────────
  const [toast, setToast] = useState(null)

  const warehouseId = Number(session?.warehouse_id || 0) || null
  const stockDebounceRef = useRef({})

  useEffect(() => {
    const h = () => setSw(window.innerWidth)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])

  // ── Load van roster ───────────────────────────────────────────────────────
  const loadVans = useCallback(async () => {
    if (!warehouseId) { setLoading(false); return }
    setLoading(true)
    setError('')
    try {
      const result = await getVanRoster(warehouseId)
      setVans(Array.isArray(result) ? result : [])
    } catch {
      setError('Error al cargar unidades')
      setVans([])
    } finally {
      setLoading(false)
    }
  }, [warehouseId])

  useEffect(() => { loadVans() }, [loadVans])

  // ── Load product catalog ──────────────────────────────────────────────────
  async function loadProductsIfNeeded() {
    if (productsLoaded) return
    try {
      const ps = await getLoadProducts()
      setProducts(Array.isArray(ps) ? ps : [])
      setProductsLoaded(true)
    } catch {
      setProductsLoaded(true) // avoid infinite retry
    }
  }

  // ── Toast helper ──────────────────────────────────────────────────────────
  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Expand / collapse van card
  // ─────────────────────────────────────────────────────────────────────────
  function handleToggle(van) {
    const id = van.employee_id
    if (expandedId === id) { setExpandedId(null); return }
    setExpandedId(id)
    loadProductsIfNeeded()
    // Init manual lines if empty
    if (!manualLines[id] || manualLines[id].length === 0) {
      setManualLines((prev) => ({ ...prev, [id]: [{ product_id: '', qty: '', product_name: '' }] }))
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Manual line helpers
  // ─────────────────────────────────────────────────────────────────────────
  function updateLine(empId, idx, field, value) {
    setManualLines((prev) => {
      const lines = [...(prev[empId] || [])]
      lines[idx] = { ...lines[idx], [field]: value }
      if (field === 'product_id' && value) {
        const p = products.find((p) => String(p.id) === String(value))
        if (p) lines[idx].product_name = p.name
      }
      return { ...prev, [empId]: lines }
    })
    // Debounce stock check when products change
    if (field === 'product_id') {
      scheduleStockCheck(empId)
    }
  }

  function addLine(empId) {
    setManualLines((prev) => ({
      ...prev,
      [empId]: [...(prev[empId] || []), { product_id: '', qty: '', product_name: '' }],
    }))
  }

  function removeLine(empId, idx) {
    setManualLines((prev) => {
      const lines = (prev[empId] || []).filter((_, i) => i !== idx)
      return { ...prev, [empId]: lines.length ? lines : [{ product_id: '', qty: '', product_name: '' }] }
    })
    scheduleStockCheck(empId)
  }

  function useSuggestion(van) {
    const id = van.employee_id
    if (!van.suggestion?.length) return
    const lines = van.suggestion
      .filter((s) => s.qty > 0)
      .map((s) => ({ product_id: String(s.product_id), qty: String(s.qty), product_name: s.product_name || '' }))
    setManualLines((prev) => ({ ...prev, [id]: lines.length ? lines : [{ product_id: '', qty: '', product_name: '' }] }))
    scheduleStockCheck(id)
    showToast('Sugerido cargado como base', 'success')
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Stock check (debounced)
  // ─────────────────────────────────────────────────────────────────────────
  function scheduleStockCheck(empId) {
    // Cancel pending timer
    if (stockDebounceRef.current[empId]) clearTimeout(stockDebounceRef.current[empId])
    stockDebounceRef.current[empId] = setTimeout(() => runStockCheck(empId), 600)
  }

  async function runStockCheck(empId) {
    const van = vans.find((v) => v.employee_id === empId)
    if (!van) return
    const locationId = van.cedis_location_id
    if (!locationId) return

    const lines = manualLines[empId] || []
    const productIds = [...new Set(
      lines.map((l) => Number(l.product_id)).filter(Boolean)
    )]
    if (!productIds.length) {
      setStockCheck((prev) => ({ ...prev, [empId]: { loading: false, items: [], error: '' } }))
      return
    }

    setStockCheck((prev) => ({ ...prev, [empId]: { loading: true, items: [], error: '' } }))
    try {
      const result = await getStockAtLocation(locationId, productIds)
      setStockCheck((prev) => ({
        ...prev,
        [empId]: { loading: false, items: Array.isArray(result) ? result : [], error: '' },
      }))
    } catch {
      setStockCheck((prev) => ({ ...prev, [empId]: { loading: false, items: [], error: 'No se pudo verificar stock' } }))
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Execute van load
  // ─────────────────────────────────────────────────────────────────────────
  async function handleConfirmLoad() {
    if (!confirmVan) return
    const van = confirmVan
    setConfirmVan(null)
    const empId = van.employee_id

    const rawLines = manualLines[empId] || []
    const lines = rawLines
      .filter((l) => l.product_id && Number(l.qty) > 0)
      .map((l) => ({ product_id: Number(l.product_id), qty: Number(l.qty) }))

    if (!lines.length) { showToast('Agrega al menos un producto', 'error'); return }

    setExecuting(empId)
    try {
      const res = await executeVanLoad(van.mobile_location_id, lines)
      if (res?.ok) {
        const pickName = res.data?.picking_name || ''
        showToast(`Carga ejecutada${pickName ? ` · ${pickName}` : ''}`, 'success')
        setExecResults((prev) => ({ ...prev, [empId]: { ok: true, message: res.message, data: res.data } }))
        // Reset manual lines for this van
        setManualLines((prev) => ({ ...prev, [empId]: [{ product_id: '', qty: '', product_name: '' }] }))
        setStockCheck((prev) => { const n = { ...prev }; delete n[empId]; return n })
        setExpandedId(null)
      } else {
        const msg = res?.error || res?.message || 'Error al ejecutar carga'
        showToast(msg, 'error')
        setExecResults((prev) => ({ ...prev, [empId]: { ok: false, message: msg } }))
      }
    } catch (e) {
      if (e.message !== 'no_session') showToast(e.message || 'Error al ejecutar carga', 'error')
    } finally {
      setExecuting(null)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Derived state helpers
  // ─────────────────────────────────────────────────────────────────────────
  function getValidLines(empId) {
    return (manualLines[empId] || []).filter((l) => l.product_id && Number(l.qty) > 0)
  }

  function getStockSummary(empId) {
    const sc = stockCheck[empId]
    if (!sc || sc.loading || !sc.items.length) return null
    const lines = manualLines[empId] || []
    const reqMap = new Map()
    for (const l of lines) {
      if (!l.product_id || !Number(l.qty)) continue
      const pid = Number(l.product_id)
      reqMap.set(pid, (reqMap.get(pid) || 0) + Number(l.qty))
    }
    const rows = []
    for (const [pid, reqQty] of reqMap) {
      const item = sc.items.find((i) => i.product_id === pid)
      const onHand = item ? item.on_hand : 0
      const line = (manualLines[empId] || []).find((l) => Number(l.product_id) === pid)
      rows.push({
        product_id: pid,
        product_name: line?.product_name || '',
        requested: reqQty,
        onHand,
        sufficient: onHand >= reqQty,
      })
    }
    return rows
  }

  function hasInsufficientStock(empId) {
    const summary = getStockSummary(empId)
    if (!summary) return false
    return summary.some((r) => !r.sufficient)
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Render
  // ─────────────────────────────────────────────────────────────────────────
  const doneCount = Object.values(execResults).filter((r) => r.ok).length

  return (
    <ScreenShell title="Cargar Unidades" backTo="/entregas">
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes toast-in { from { transform: translateX(-50%) translateY(16px); opacity:0; } to { transform: translateX(-50%) translateY(0); opacity:1; } }
        @keyframes slide-down { from { max-height:0; opacity:0; } to { max-height:2000px; opacity:1; } }
        select { color-scheme: dark; }
        select option { background-color: #1a1f2e; color: #e2e8f0; }
      `}</style>

      {/* ── Summary bar ─────────────────────────────────────────────────── */}
      {!loading && vans.length > 0 && (
        <div style={{
          padding: '12px 16px', borderRadius: TOKENS.radius.lg, marginBottom: 16,
          background: 'linear-gradient(180deg, rgba(21,73,155,0.18), rgba(21,73,155,0.06))',
          border: `1px solid rgba(97,178,255,0.16)`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <p style={{ ...typo.title, color: TOKENS.colors.text, margin: 0 }}>Unidades del CEDIS</p>
            <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '3px 0 0' }}>
              {vans.length} repartidor{vans.length !== 1 ? 'es' : ''} activo{vans.length !== 1 ? 's' : ''}
              {doneCount > 0 ? ` · ${doneCount} cargado${doneCount !== 1 ? 's' : ''}` : ''}
            </p>
          </div>
          <button
            onClick={loadVans}
            style={{
              width: 34, height: 34, borderRadius: TOKENS.radius.md, cursor: 'pointer',
              background: 'rgba(43,143,224,0.10)', border: `1px solid rgba(43,143,224,0.25)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            title="Recargar"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
              stroke={TOKENS.colors.blue2} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
          </button>
        </div>
      )}

      {/* ── Error ──────────────────────────────────────────────────────── */}
      {error && (
        <div style={{
          marginBottom: 12, padding: 12, borderRadius: TOKENS.radius.sm,
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.20)',
        }}>
          <p style={{ ...typo.caption, color: TOKENS.colors.error, margin: 0 }}>{error}</p>
        </div>
      )}

      {/* ── Loading ─────────────────────────────────────────────────────── */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}>
          <Spinner size={32} />
        </div>
      ) : vans.length === 0 ? (
        <EmptyState icon="🚛" title="Sin repartidores registrados para este CEDIS" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {vans.map((van) => {
            const empId = van.employee_id
            const isExpanded = expandedId === empId
            const lines = manualLines[empId] || []
            const validLines = getValidLines(empId)
            const sc = stockCheck[empId]
            const stockSummary = getStockSummary(empId)
            const stockInsufficient = hasInsufficientStock(empId)
            const isExecuting = executing === empId
            const result = execResults[empId]
            const hasSuggestion = van.suggestion?.length > 0
            const canConfirm = validLines.length > 0 && !isExecuting && !sc?.loading && !stockInsufficient

            return (
              <div key={empId} style={{
                borderRadius: TOKENS.radius.xl,
                background: TOKENS.glass.panel,
                border: `1px solid ${result?.ok ? 'rgba(34,197,94,0.25)' : TOKENS.colors.border}`,
                boxShadow: TOKENS.shadow.soft,
                overflow: 'hidden',
              }}>
                {/* ── Van header ─────────────────────────────────────── */}
                <button
                  onClick={() => handleToggle(van)}
                  style={{
                    width: '100%', padding: 16, textAlign: 'left',
                    background: 'transparent', cursor: 'pointer', display: 'block',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <VanIcon />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ ...typo.h2, color: TOKENS.colors.text, margin: 0, fontSize: 15 }}>
                        {van.employee_name || `Empleado ${empId}`}
                      </p>
                      <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '3px 0 0' }}>
                        {van.mobile_location_name || `Ubicación ${van.mobile_location_id}`}
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                      <ChevronIcon open={isExpanded} />
                    </div>
                  </div>
                </button>

                {/* ── Expanded body ──────────────────────────────────── */}
                {isExpanded && (
                  <div style={{
                    padding: '0 16px 18px',
                    borderTop: `1px solid ${TOKENS.colors.border}`,
                    animation: 'slide-down 0.2s ease',
                  }}>

                    {/* Last load result banner */}
                    {result?.ok && (
                      <div style={{
                        margin: '12px 0 4px', padding: '9px 12px', borderRadius: TOKENS.radius.sm,
                        background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)',
                        display: 'flex', alignItems: 'center', gap: 8,
                      }}>
                        <span style={{ fontSize: 15 }}>✓</span>
                        <div>
                          <p style={{ ...typo.caption, color: TOKENS.colors.success, margin: 0, fontWeight: 600 }}>
                            Carga ejecutada
                          </p>
                          {result.data?.picking_name && (
                            <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '2px 0 0', fontSize: 11 }}>
                              {result.data.picking_name}
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* ── SUGERIDO ──────────────────────────────────── */}
                    {hasSuggestion ? (
                      <>
                        <SectionLabel typo={typo}>
                          SUGERIDO SUPERVISOR
                          {van.forecast_date ? ` · ${van.forecast_date}` : ''}
                        </SectionLabel>
                        <div style={{
                          borderRadius: TOKENS.radius.sm,
                          border: '1px solid rgba(43,143,224,0.18)',
                          background: 'rgba(43,143,224,0.05)',
                          overflow: 'hidden',
                          marginBottom: 8,
                        }}>
                          {van.suggestion.map((s, i) => (
                            <div key={i} style={{
                              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                              padding: '9px 12px',
                              borderBottom: i < van.suggestion.length - 1
                                ? '1px solid rgba(43,143,224,0.10)' : 'none',
                            }}>
                              <span style={{ ...typo.body, color: TOKENS.colors.textSoft, flex: 1, minWidth: 0 }}>
                                {s.product_name || `#${s.product_id}`}
                              </span>
                              <span style={{
                                fontSize: 13, fontWeight: 700, color: TOKENS.colors.blue2,
                                background: 'rgba(43,143,224,0.15)', borderRadius: TOKENS.radius.pill,
                                padding: '2px 10px', flexShrink: 0, marginLeft: 10,
                              }}>{s.qty}</span>
                            </div>
                          ))}
                        </div>
                        <button
                          onClick={() => useSuggestion(van)}
                          style={{
                            width: '100%', padding: '8px 0', borderRadius: TOKENS.radius.sm,
                            background: 'rgba(43,143,224,0.08)', border: '1px dashed rgba(43,143,224,0.35)',
                            color: TOKENS.colors.blue2, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                            marginBottom: 4,
                          }}
                        >
                          Usar sugerido como base
                        </button>
                      </>
                    ) : (
                      <div style={{ marginTop: 12, marginBottom: 4 }}>
                        <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0 }}>
                          Sin pronóstico confirmado — captura la carga manualmente.
                        </p>
                      </div>
                    )}

                    {/* ── CARGA MANUAL ────────────────────────────── */}
                    <SectionLabel typo={typo}>CARGA MANUAL</SectionLabel>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 }}>
                      {lines.map((line, idx) => (
                        <div key={idx} style={{
                          padding: 10, borderRadius: TOKENS.radius.sm,
                          background: TOKENS.colors.surfaceSoft, border: `1px solid ${TOKENS.colors.border}`,
                        }}>
                          {/* Product select */}
                          <select
                            value={String(line.product_id || '')}
                            onChange={(e) => updateLine(empId, idx, 'product_id', e.target.value)}
                            style={{
                              width: '100%', padding: '8px 10px', borderRadius: TOKENS.radius.sm,
                              background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
                              color: line.product_id ? TOKENS.colors.text : TOKENS.colors.textMuted,
                              fontSize: 13, marginBottom: 8, outline: 'none',
                            }}
                          >
                            <option value="">Seleccionar producto...</option>
                            {/* Keep current if not in catalog */}
                            {line.product_id && !products.find((p) => String(p.id) === String(line.product_id)) && (
                              <option value={String(line.product_id)}>{line.product_name || `Producto ${line.product_id}`}</option>
                            )}
                            {products.map((p) => (
                              <option key={p.id} value={String(p.id)}>{p.name}</option>
                            ))}
                          </select>

                          {/* Qty + remove */}
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <input
                              type="number"
                              inputMode="numeric"
                              placeholder="Cantidad"
                              value={line.qty}
                              onChange={(e) => updateLine(empId, idx, 'qty', e.target.value)}
                              min={1}
                              style={{
                                flex: 1, padding: '8px 10px', borderRadius: TOKENS.radius.sm,
                                background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
                                color: TOKENS.colors.text, fontSize: 13, outline: 'none',
                              }}
                            />
                            <button
                              onClick={() => removeLine(empId, idx)}
                              style={{
                                width: 34, height: 34, borderRadius: TOKENS.radius.sm, flexShrink: 0,
                                background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.22)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                              }}
                            >
                              <XIcon />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Add product row */}
                    <button
                      onClick={() => addLine(empId)}
                      style={{
                        width: '100%', padding: '8px 0', borderRadius: TOKENS.radius.sm,
                        background: TOKENS.colors.surface, border: `1px dashed ${TOKENS.colors.border}`,
                        color: TOKENS.colors.textMuted, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                        marginBottom: 4,
                      }}
                    >
                      <PlusIcon /> Agregar producto
                    </button>

                    {/* ── STOCK EN CEDIS ──────────────────────────── */}
                    {(sc || stockSummary) && (
                      <>
                        <SectionLabel typo={typo}>
                          STOCK EN CEDIS
                          {van.cedis_location_name ? ` · ${van.cedis_location_name}` : ''}
                        </SectionLabel>

                        {sc?.loading && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0' }}>
                            <Spinner size={16} />
                            <span style={{ ...typo.caption, color: TOKENS.colors.textMuted }}>Verificando disponibilidad...</span>
                          </div>
                        )}

                        {!sc?.loading && stockSummary && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 4 }}>
                            {stockSummary.map((row, i) => (
                              <StockRow key={row.product_id || i} {...row} typo={typo} />
                            ))}
                          </div>
                        )}

                        {!sc?.loading && sc?.error && (
                          <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '4px 0' }}>
                            {sc.error}
                          </p>
                        )}

                        {stockInsufficient && (
                          <div style={{
                            marginTop: 6, padding: '8px 12px', borderRadius: TOKENS.radius.sm,
                            background: 'rgba(239,68,68,0.09)', border: '1px solid rgba(239,68,68,0.28)',
                            display: 'flex', alignItems: 'center', gap: 8,
                          }}>
                            <span style={{ fontSize: 15 }}>⚠️</span>
                            <p style={{ ...typo.caption, color: '#ef4444', margin: 0, fontWeight: 600 }}>
                              Stock insuficiente — ajusta las cantidades antes de confirmar
                            </p>
                          </div>
                        )}
                      </>
                    )}

                    {/* Manual stock check trigger (when no auto-check happened yet) */}
                    {!sc && validLines.length > 0 && van.cedis_location_id && (
                      <button
                        onClick={() => runStockCheck(empId)}
                        style={{
                          width: '100%', padding: '7px 0', borderRadius: TOKENS.radius.sm, marginBottom: 8,
                          background: 'rgba(43,143,224,0.06)', border: '1px dashed rgba(43,143,224,0.25)',
                          color: TOKENS.colors.blue2, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        }}
                      >
                        Verificar stock en CEDIS
                      </button>
                    )}

                    {/* ── Confirm button ───────────────────────────── */}
                    <button
                      onClick={() => { if (canConfirm) setConfirmVan(van) }}
                      disabled={!canConfirm}
                      style={{
                        marginTop: 12, width: '100%', padding: '13px 0',
                        borderRadius: TOKENS.radius.lg, fontSize: 14, fontWeight: 700,
                        cursor: canConfirm ? 'pointer' : 'default',
                        transition: `opacity ${TOKENS.motion.fast}`,
                        ...(stockInsufficient ? {
                          background: 'rgba(239,68,68,0.12)', color: '#ef4444',
                          border: '1px solid rgba(239,68,68,0.28)', boxShadow: 'none',
                        } : !canConfirm ? {
                          background: TOKENS.colors.surface, color: TOKENS.colors.textMuted,
                          border: `1px solid ${TOKENS.colors.border}`, boxShadow: 'none',
                          opacity: 0.6,
                        } : {
                          background: 'linear-gradient(90deg, #15499B, #2B8FE0)', color: '#fff',
                          border: 'none', boxShadow: '0 8px 20px rgba(43,143,224,0.28)',
                        }),
                      }}
                    >
                      {isExecuting
                        ? 'Ejecutando carga...'
                        : sc?.loading
                          ? 'Verificando stock...'
                          : stockInsufficient
                            ? 'Sin stock suficiente'
                            : validLines.length === 0
                              ? 'Agrega productos para cargar'
                              : 'Confirmar Carga'}
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div style={{ height: 40 }} />

      {/* ── Confirm dialog ──────────────────────────────────────────────── */}
      {confirmVan && (
        <ConfirmDialog
          open
          title="Confirmar carga de van"
          message={`¿Ejecutar la carga de ${getValidLines(confirmVan.employee_id).length} producto(s) hacia ${confirmVan.mobile_location_name || 'la unidad'}?`}
          confirmLabel="Confirmar"
          confirmColor={TOKENS.colors.blue2}
          onConfirm={handleConfirmLoad}
          onCancel={() => setConfirmVan(null)}
        />
      )}

      {/* ── Toast ───────────────────────────────────────────────────────── */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
          zIndex: 1100, padding: '10px 22px', borderRadius: TOKENS.radius.pill,
          background: toast.type === 'error' ? 'rgba(239,68,68,0.93)' : 'rgba(34,197,94,0.93)',
          color: '#fff', fontSize: 13, fontWeight: 600,
          boxShadow: TOKENS.shadow.md, animation: 'toast-in 0.22s ease',
          whiteSpace: 'nowrap', maxWidth: 'calc(100vw - 48px)',
        }}>
          {toast.msg}
        </div>
      )}
    </ScreenShell>
  )
}
