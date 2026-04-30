import { useEffect, useMemo, useState, useCallback } from 'react'
import { useSession } from '../../App'
import { TOKENS, getTypo } from '../../tokens'
import { getTodayRoutes, getLoadDetail, confirmLoad, rejectLoad, updateLoadLines, getLoadProducts, getLoadStock } from './entregasService'
import { ScreenShell, ConfirmDialog, EmptyState, StatusBadge } from './components'

/** Extract numeric ID from a Many2one field (could be false, number, or [id, name] tuple). */
function extractPickingId(field) {
  if (!field) return null
  if (typeof field === 'number') return field
  if (Array.isArray(field) && field.length >= 1 && typeof field[0] === 'number') return field[0]
  return null
}

const stateColors = {
  draft: TOKENS.colors.textMuted,
  published: TOKENS.colors.blue2,
  in_progress: TOKENS.colors.warning,
  closed: TOKENS.colors.success,
  reconciled: TOKENS.colors.textSoft,
}

const stateLabels = {
  draft: 'Borrador',
  published: 'Publicada',
  in_progress: 'En Progreso',
  closed: 'Cerrada',
  reconciled: 'Conciliada',
}

export default function ScreenCargaUnidades() {
  const { session } = useSession()
  const [sw, setSw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])

  const [routes, setRoutes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Expanded route for detail view
  const [expandedId, setExpandedId] = useState(null)
  const [loadLines, setLoadLines] = useState({}) // { [routeId]: { lines:[], loading:bool, error:string } }

  // Confirm dialog
  const [confirmRoute, setConfirmRoute] = useState(null)
  const [confirming, setConfirming] = useState(null) // routePlanId being confirmed

  // Reject dialog
  const [rejectRoute, setRejectRoute] = useState(null)
  const [rejecting, setRejecting] = useState(null)

  // Edit mode per route
  const [editMode, setEditMode] = useState({}) // { [routeId]: bool }
  const [editLines, setEditLines] = useState({}) // { [routeId]: [{product_id, qty, product_name}] }
  const [savingLines, setSavingLines] = useState(null) // routeId being saved

  // Product catalog (loaded on demand)
  const [products, setProducts] = useState([])
  const [productsLoaded, setProductsLoaded] = useState(false)

  // Stock disponible en CEDIS por ruta: { [routeId]: { data, loading, error } }
  const [stockData, setStockData] = useState({})

  // Toast
  const [toast, setToast] = useState(null)

  const warehouseId = Number(session?.warehouse_id || 0) || null

  useEffect(() => {
    const h = () => setSw(window.innerWidth)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])

  const loadRoutes = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const r = await getTodayRoutes(warehouseId)
      // Ocultar borradores sin picking asignado — no tienen carga que gestionar todavía.
      const visible = (Array.isArray(r) ? r : []).filter(
        (route) => route.state !== 'draft' || Boolean(extractPickingId(route.load_picking_id))
      )
      setRoutes(visible)
    } catch (e) {
      if (e.message !== 'no_session') setError('Error al cargar rutas')
      setRoutes([])
    } finally {
      setLoading(false)
    }
  }, [warehouseId])

  useEffect(() => { loadRoutes() }, [loadRoutes])

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 2800)
  }

  const sealed = routes.filter((r) => r.load_sealed).length
  const total = routes.length

  async function handleToggleExpand(route) {
    const routeId = route.id
    if (expandedId === routeId) {
      setExpandedId(null)
      return
    }
    setExpandedId(routeId)

    const pickingId = extractPickingId(route.load_picking_id)
    if (!pickingId) {
      setLoadLines((prev) => ({ ...prev, [routeId]: { lines: [], loading: false, error: 'Detalle no disponible' } }))
      return
    }

    // Cargar detalle y stock en paralelo (solo si aún no hay datos)
    const needsDetail = !loadLines[routeId]
    const needsStock = !stockData[routeId]

    if (needsDetail) {
      setLoadLines((prev) => ({ ...prev, [routeId]: { lines: [], loading: true, error: '' } }))
    }
    if (needsStock) {
      setStockData((prev) => ({ ...prev, [routeId]: { data: null, loading: true, error: '' } }))
    }

    await Promise.all([
      needsDetail
        ? getLoadDetail(pickingId)
            .then((lines) => setLoadLines((prev) => ({ ...prev, [routeId]: { lines: Array.isArray(lines) ? lines : [], loading: false, error: '' } })))
            .catch(() => setLoadLines((prev) => ({ ...prev, [routeId]: { lines: [], loading: false, error: 'Error al cargar detalle' } })))
        : Promise.resolve(),
      needsStock
        ? getLoadStock(pickingId)
            .then((data) => setStockData((prev) => ({ ...prev, [routeId]: { data, loading: false, error: '' } })))
            .catch(() => setStockData((prev) => ({ ...prev, [routeId]: { data: null, loading: false, error: 'Error al consultar stock' } })))
        : Promise.resolve(),
    ])
  }

  async function handleConfirmLoad() {
    if (!confirmRoute) return
    const routePlanId = confirmRoute.id
    setConfirmRoute(null)
    setConfirming(routePlanId)
    try {
      const res = await confirmLoad(routePlanId)
      // Backend transaccional puede devolver { ok:false, error } sin lanzar excepcion
      if (res && res.ok === false) {
        const msg = res.error || 'Verificar disponibilidad de stock'
        showToast(`Error: ${msg}`, 'error')
        return
      }
      showToast('Carga sellada y picking validado')
      // Clear cached detail and stock for this route
      setLoadLines((prev) => { const n = { ...prev }; delete n[routePlanId]; return n })
      setStockData((prev) => { const n = { ...prev }; delete n[routePlanId]; return n })
      setExpandedId(null)
      await loadRoutes()
    } catch (e) {
      if (e.message === 'no_session') return
      const msg = e?.message || 'Verificar disponibilidad de stock'
      showToast(`Error: ${msg}`, 'error')
    } finally {
      setConfirming(null)
    }
  }

  async function loadProductsIfNeeded() {
    if (productsLoaded) return
    const ps = await getLoadProducts()
    setProducts(ps)
    setProductsLoaded(true)
  }

  function enterEditMode(route) {
    const routeId = route.id
    const detail = loadLines[routeId]
    const currentLines = (detail?.lines || []).map((l) => ({
      product_id: Array.isArray(l.product_id) ? l.product_id[0] : (l.product_id || ''),
      product_name: l.product_name || (Array.isArray(l.product_id) ? l.product_id[1] : ''),
      qty: String(l.product_uom_qty ?? l.qty ?? l.quantity ?? 1),
    }))
    setEditLines((prev) => ({ ...prev, [routeId]: currentLines.length ? currentLines : [{ product_id: '', qty: '', product_name: '' }] }))
    setEditMode((prev) => ({ ...prev, [routeId]: true }))
    loadProductsIfNeeded()
  }

  function exitEditMode(routeId) {
    setEditMode((prev) => ({ ...prev, [routeId]: false }))
  }

  function updateEditLine(routeId, idx, field, value) {
    setEditLines((prev) => {
      const lines = [...(prev[routeId] || [])]
      lines[idx] = { ...lines[idx], [field]: value }
      // If product changed, auto-fill name
      if (field === 'product_id' && value) {
        const product = products.find((p) => String(p.id) === String(value))
        if (product) lines[idx].product_name = product.name
      }
      return { ...prev, [routeId]: lines }
    })
  }

  function addEditLine(routeId) {
    setEditLines((prev) => ({
      ...prev,
      [routeId]: [...(prev[routeId] || []), { product_id: '', qty: '', product_name: '' }],
    }))
  }

  function removeEditLine(routeId, idx) {
    setEditLines((prev) => {
      const lines = (prev[routeId] || []).filter((_, i) => i !== idx)
      return { ...prev, [routeId]: lines.length ? lines : [{ product_id: '', qty: '', product_name: '' }] }
    })
  }

  async function handleSaveLines(route) {
    const routeId = route.id
    const lines = (editLines[routeId] || [])
      .filter((l) => l.product_id && Number(l.qty) > 0)
      .map((l) => ({ product_id: Number(l.product_id), qty: Number(l.qty) }))

    if (!lines.length) { showToast('Agrega al menos un producto con cantidad', 'error'); return }

    setSavingLines(routeId)
    try {
      const res = await updateLoadLines(routeId, lines)
      if (res?.ok === false) {
        showToast(res.error || 'Error al guardar', 'error')
        return
      }
      showToast('Líneas actualizadas')
      exitEditMode(routeId)
      // Reload detail and stock
      setLoadLines((prev) => { const n = { ...prev }; delete n[routeId]; return n })
      setStockData((prev) => { const n = { ...prev }; delete n[routeId]; return n })
      const pickingId = extractPickingId(route.load_picking_id)
      if (pickingId) {
        setLoadLines((prev) => ({ ...prev, [routeId]: { lines: [], loading: true, error: '' } }))
        setStockData((prev) => ({ ...prev, [routeId]: { data: null, loading: true, error: '' } }))
        Promise.all([
          getLoadDetail(pickingId)
            .then((ls) => setLoadLines((prev) => ({ ...prev, [routeId]: { lines: Array.isArray(ls) ? ls : [], loading: false, error: '' } })))
            .catch(() => setLoadLines((prev) => ({ ...prev, [routeId]: { lines: [], loading: false, error: 'Error al recargar' } }))),
          getLoadStock(pickingId)
            .then((data) => setStockData((prev) => ({ ...prev, [routeId]: { data, loading: false, error: '' } })))
            .catch(() => setStockData((prev) => ({ ...prev, [routeId]: { data: null, loading: false, error: '' } }))),
        ])
      }
    } catch (e) {
      showToast(e.message || 'Error al guardar', 'error')
    } finally {
      setSavingLines(null)
    }
  }

  async function handleRejectLoad() {
    if (!rejectRoute) return
    const routeId = rejectRoute.id
    setRejectRoute(null)
    setRejecting(routeId)
    try {
      const res = await rejectLoad(routeId)
      if (res?.ok === false) {
        showToast(res.error || 'Error al rechazar', 'error')
        return
      }
      showToast('Carga rechazada')
      setLoadLines((prev) => { const n = { ...prev }; delete n[routeId]; return n })
      setStockData((prev) => { const n = { ...prev }; delete n[routeId]; return n })
      setEditMode((prev) => ({ ...prev, [routeId]: false }))
      setExpandedId(null)
      await loadRoutes()
    } catch (e) {
      if (e.message === 'no_session') return
      showToast(e.message || 'Error al rechazar', 'error')
    } finally {
      setRejecting(null)
    }
  }

  function stateBadge(state) {
    const color = stateColors[state] || TOKENS.colors.textMuted
    const label = stateLabels[state] || state || '\u2014'
    return (
      <span style={{
        padding: '3px 8px', borderRadius: TOKENS.radius.pill,
        background: `${color}15`, border: `1px solid ${color}30`,
        fontSize: 11, fontWeight: 700, color,
      }}>{label}</span>
    )
  }

  return (
    <ScreenShell title="Cargar Unidades" backTo="/entregas">
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes toast-in { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes slide-down { from { max-height: 0; opacity: 0; } to { max-height: 600px; opacity: 1; } }
      `}</style>

      {/* Progress summary */}
      {!loading && routes.length > 0 && (
        <div style={{
          padding: '12px 16px', borderRadius: TOKENS.radius.lg, marginBottom: 16,
          background: 'linear-gradient(180deg, rgba(21,73,155,0.18), rgba(21,73,155,0.06))',
          border: `1px solid rgba(97,178,255,0.16)`,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ ...typo.title, color: TOKENS.colors.text }}>Progreso de carga</span>
            <span style={{ ...typo.h2, color: sealed === total ? TOKENS.colors.success : TOKENS.colors.blue3 }}>
              {sealed}/{total}
            </span>
          </div>
          <div style={{ width: '100%', height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)' }}>
            <div style={{
              width: total > 0 ? `${Math.round((sealed / total) * 100)}%` : '0%',
              height: '100%', borderRadius: 3,
              background: sealed === total
                ? `linear-gradient(90deg, ${TOKENS.colors.success}, ${TOKENS.colors.success})`
                : `linear-gradient(90deg, ${TOKENS.colors.blue2}, ${TOKENS.colors.blue3})`,
              transition: 'width 0.3s',
            }} />
          </div>
          <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '6px 0 0' }}>
            {sealed === total ? 'Todas las rutas cargadas' : `${total - sealed} rutas pendientes de carga`}
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{
          margin: '0 0 12px', padding: 12, borderRadius: TOKENS.radius.sm,
          background: TOKENS.colors.errorSoft, border: '1px solid rgba(239,68,68,0.2)',
        }}>
          <p style={{ ...typo.caption, color: TOKENS.colors.error, margin: 0 }}>{error}</p>
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}>
          <div style={{
            width: 32, height: 32, border: '2px solid rgba(255,255,255,0.12)',
            borderTop: `2px solid ${TOKENS.colors.blue2}`, borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }} />
        </div>
      ) : routes.length === 0 ? (
        <EmptyState icon="🚛" title="Sin rutas con carga pendiente" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {routes.map((route) => {
            const progress = route.stops_total > 0 ? Math.round((route.stops_done / route.stops_total) * 100) : 0
            // Permite confirmar si hay picking de carga (creado por pronóstico confirmado)
            // incluso cuando el plan está en borrador.
            const hasLoadPicking = Boolean(extractPickingId(route.load_picking_id))
            const stockInfo = stockData[route.id]
            const stockLoading = Boolean(stockInfo?.loading)
            const stockInsufficient = stockInfo && !stockInfo.loading && stockInfo.data && !stockInfo.data.all_sufficient
            const canConfirm = !route.load_sealed && (route.state !== 'draft' || hasLoadPicking) && !stockInsufficient
            const isExpanded = expandedId === route.id
            const detail = loadLines[route.id]
            const isConfirming = confirming === route.id
            const isEditMode = Boolean(editMode[route.id])

            return (
              <div key={route.id} style={{
                borderRadius: TOKENS.radius.xl,
                background: TOKENS.glass.panel,
                border: `1px solid ${route.load_sealed ? 'rgba(34,197,94,0.20)' : TOKENS.colors.border}`,
                boxShadow: TOKENS.shadow.soft,
                overflow: 'hidden',
              }}>
                {/* Route header - tappable */}
                <button
                  onClick={() => handleToggleExpand(route)}
                  style={{
                    width: '100%', padding: 16, textAlign: 'left',
                    background: 'transparent', cursor: 'pointer',
                    display: 'block',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ ...typo.h2, color: TOKENS.colors.text, margin: 0, fontSize: 16 }}>
                        {route.name || '\u2014'}
                      </p>
                      <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '4px 0 0' }}>
                        {route.driver || 'Sin chofer'}
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                      {route.load_sealed && (
                        <span style={{
                          padding: '3px 8px', borderRadius: TOKENS.radius.pill,
                          background: TOKENS.colors.successSoft, border: `1px solid rgba(34,197,94,0.25)`,
                          fontSize: 11, fontWeight: 700, color: TOKENS.colors.success,
                        }}>Cargada</span>
                      )}
                      {stateBadge(route.state)}
                      <svg
                        width="16" height="16" viewBox="0 0 24 24" fill="none"
                        stroke="rgba(255,255,255,0.3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                        style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: `transform ${TOKENS.motion.fast}` }}
                      >
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </div>
                  </div>

                  {/* Stops + Progress */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ ...typo.caption, color: TOKENS.colors.textMuted }}>
                        Paradas: {route.stops_done || 0} / {route.stops_total || 0}
                      </span>
                      <span style={{ ...typo.caption, color: TOKENS.colors.textMuted }}>{progress}%</span>
                    </div>
                    <div style={{ width: '100%', height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)' }}>
                      <div style={{
                        width: `${progress}%`, height: '100%', borderRadius: 3,
                        background: `linear-gradient(90deg, ${TOKENS.colors.blue2}, ${TOKENS.colors.success})`,
                        transition: 'width 0.3s',
                      }} />
                    </div>
                  </div>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div style={{
                    padding: '0 16px 16px',
                    borderTop: `1px solid ${TOKENS.colors.border}`,
                    animation: 'slide-down 0.25s ease',
                    overflow: 'hidden',
                  }}>
                    {/* Header: DETALLE DE CARGA + Editar toggle */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '12px 0 8px' }}>
                      <p style={{ ...typo.overline, color: TOKENS.colors.textLow, margin: 0 }}>DETALLE DE CARGA</p>
                      {!route.load_sealed && hasLoadPicking && !isEditMode && (
                        <button onClick={() => enterEditMode(route)} style={{
                          padding: '4px 10px', borderRadius: TOKENS.radius.pill,
                          background: 'rgba(43,143,224,0.12)', border: `1px solid rgba(43,143,224,0.3)`,
                          color: TOKENS.colors.blue2, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                        }}>Editar</button>
                      )}
                      {isEditMode && (
                        <button onClick={() => exitEditMode(route.id)} style={{
                          padding: '4px 10px', borderRadius: TOKENS.radius.pill,
                          background: 'transparent', border: `1px solid ${TOKENS.colors.border}`,
                          color: TOKENS.colors.textMuted, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                        }}>Cancelar</button>
                      )}
                    </div>

                    {/* Read-only view */}
                    {!isEditMode && (
                      detail?.loading ? (
                        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0' }}>
                          <div style={{
                            width: 22, height: 22, border: '2px solid rgba(255,255,255,0.12)',
                            borderTop: `2px solid ${TOKENS.colors.blue2}`, borderRadius: '50%',
                            animation: 'spin 0.8s linear infinite',
                          }} />
                        </div>
                      ) : detail?.error ? (
                        <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '8px 0', textAlign: 'center' }}>
                          {detail.error}
                        </p>
                      ) : detail?.lines?.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {detail.lines.map((line, idx) => (
                            <div key={line.id || idx} style={{
                              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                              padding: '8px 10px', borderRadius: TOKENS.radius.sm,
                              background: TOKENS.colors.surfaceSoft, border: `1px solid ${TOKENS.colors.border}`,
                            }}>
                              <span style={{ ...typo.body, color: TOKENS.colors.textSoft, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {line.product_name || (Array.isArray(line.product_id) ? line.product_id[1] : `Producto ${line.product_id || idx + 1}`)}
                              </span>
                              <span style={{ ...typo.title, color: TOKENS.colors.text, marginLeft: 12, flexShrink: 0 }}>
                                {line.product_uom_qty ?? line.qty ?? line.quantity ?? '\u2014'} {line.uom || ''}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '8px 0', textAlign: 'center' }}>
                          Sin lineas de carga
                        </p>
                      )
                    )}

                    {/* Edit mode */}
                    {isEditMode && (
                      <div style={{ marginBottom: 10 }}>
                        {(editLines[route.id] || []).map((line, idx) => (
                          <div key={idx} style={{
                            padding: 10, borderRadius: TOKENS.radius.sm, marginBottom: 8,
                            background: TOKENS.colors.surfaceSoft, border: `1px solid ${TOKENS.colors.border}`,
                          }}>
                            {/* Product selector */}
                            <select
                              value={String(line.product_id || '')}
                              onChange={(e) => updateEditLine(route.id, idx, 'product_id', e.target.value)}
                              style={{
                                width: '100%', padding: '8px 10px', borderRadius: TOKENS.radius.sm,
                                background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
                                color: TOKENS.colors.text, fontSize: 13, marginBottom: 8, outline: 'none',
                              }}
                            >
                              <option value="">Seleccionar producto...</option>
                              {/* Show current product as first option if not in catalog */}
                              {line.product_id && !products.find((p) => String(p.id) === String(line.product_id)) && (
                                <option value={String(line.product_id)}>{line.product_name || `Producto ${line.product_id}`}</option>
                              )}
                              {products.map((p) => (
                                <option key={p.id} value={String(p.id)}>{p.name}</option>
                              ))}
                            </select>

                            {/* Qty + delete */}
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                              <input
                                type="number"
                                inputMode="numeric"
                                placeholder="Cantidad"
                                value={line.qty}
                                onChange={(e) => updateEditLine(route.id, idx, 'qty', e.target.value)}
                                style={{
                                  flex: 1, padding: '8px 10px', borderRadius: TOKENS.radius.sm,
                                  background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
                                  color: TOKENS.colors.text, fontSize: 13, outline: 'none',
                                }}
                              />
                              <button
                                onClick={() => removeEditLine(route.id, idx)}
                                style={{
                                  width: 34, height: 34, borderRadius: TOKENS.radius.sm, flexShrink: 0,
                                  background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                                }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                              </button>
                            </div>
                          </div>
                        ))}

                        {/* Add product */}
                        <button onClick={() => addEditLine(route.id)} style={{
                          width: '100%', padding: '8px 0', borderRadius: TOKENS.radius.sm, marginBottom: 10,
                          background: TOKENS.colors.surface, border: `1px dashed ${TOKENS.colors.border}`,
                          color: TOKENS.colors.textMuted, fontSize: 12, fontWeight: 600,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, cursor: 'pointer',
                        }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                          Agregar producto
                        </button>

                        {/* Save lines */}
                        <button
                          onClick={() => handleSaveLines(route)}
                          disabled={savingLines === route.id}
                          style={{
                            width: '100%', padding: '10px 0', borderRadius: TOKENS.radius.md,
                            background: savingLines === route.id ? TOKENS.colors.surface : TOKENS.colors.blue2,
                            color: '#fff', fontSize: 13, fontWeight: 700,
                            opacity: savingLines === route.id ? 0.6 : 1, cursor: savingLines === route.id ? 'default' : 'pointer',
                          }}
                        >
                          {savingLines === route.id ? 'Guardando...' : 'Guardar cambios'}
                        </button>
                      </div>
                    )}

                    {/* Stock en CEDIS */}
                    {!isEditMode && hasLoadPicking && (
                      <div style={{ marginTop: 14, marginBottom: 2 }}>
                        {/* Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <p style={{ ...typo.overline, color: TOKENS.colors.textLow, margin: 0 }}>STOCK EN CEDIS</p>
                          {stockInfo?.data?.location_name && (
                            <span style={{ fontSize: 10, color: TOKENS.colors.textMuted, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {stockInfo.data.location_name}
                            </span>
                          )}
                        </div>

                        {/* Loading */}
                        {stockLoading && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0' }}>
                            <div style={{
                              width: 16, height: 16, border: '2px solid rgba(255,255,255,0.12)',
                              borderTop: `2px solid ${TOKENS.colors.blue2}`, borderRadius: '50%',
                              animation: 'spin 0.8s linear infinite', flexShrink: 0,
                            }} />
                            <span style={{ ...typo.caption, color: TOKENS.colors.textMuted }}>Verificando disponibilidad...</span>
                          </div>
                        )}

                        {/* Lines */}
                        {!stockLoading && stockInfo?.data?.lines?.length > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {stockInfo.data.lines.map((sl, idx) => (
                              <div key={sl.product_id || idx} style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                padding: '8px 10px', borderRadius: TOKENS.radius.sm,
                                background: sl.sufficient ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)',
                                border: `1px solid ${sl.sufficient ? 'rgba(34,197,94,0.18)' : 'rgba(239,68,68,0.30)'}`,
                              }}>
                                <span style={{
                                  ...typo.caption, color: TOKENS.colors.textSoft,
                                  flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                }}>
                                  {sl.product_name}
                                </span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, marginLeft: 8 }}>
                                  <span style={{ fontSize: 11, color: TOKENS.colors.textMuted }}>
                                    Pedido: <strong style={{ color: TOKENS.colors.text }}>{sl.requested_qty}</strong>
                                  </span>
                                  <span style={{ fontSize: 11, color: TOKENS.colors.textMuted }}>
                                    Disp: <strong style={{ color: sl.sufficient ? TOKENS.colors.success : '#ef4444' }}>
                                      {sl.available_qty}
                                    </strong>
                                  </span>
                                  <span style={{ fontSize: 14 }}>{sl.sufficient ? '✓' : '⚠'}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Sin movimientos vigentes (ya ejecutado) */}
                        {!stockLoading && stockInfo?.data?.lines?.length === 0 && stockInfo?.data && (
                          <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0 }}>
                            Sin movimientos pendientes
                          </p>
                        )}

                        {/* Error al consultar */}
                        {!stockLoading && stockInfo?.error && !stockInfo?.data && (
                          <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0 }}>
                            No se pudo consultar stock
                          </p>
                        )}

                        {/* Banner de stock insuficiente */}
                        {stockInsufficient && (
                          <div style={{
                            marginTop: 8, padding: '9px 12px', borderRadius: TOKENS.radius.sm,
                            background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.30)',
                            display: 'flex', alignItems: 'center', gap: 8,
                          }}>
                            <span style={{ fontSize: 16 }}>⚠️</span>
                            <p style={{ ...typo.caption, color: '#ef4444', margin: 0, fontWeight: 600 }}>
                              Stock insuficiente — ajusta las cantidades antes de confirmar
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Action buttons row */}
                    {!isEditMode && (
                      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                        {/* Reject load */}
                        {!route.load_sealed && hasLoadPicking && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setRejectRoute(route) }}
                            disabled={rejecting === route.id}
                            style={{
                              flex: '0 0 auto', padding: '12px 14px', borderRadius: TOKENS.radius.lg,
                              background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
                              color: '#ef4444', fontSize: 13, fontWeight: 600,
                              opacity: rejecting === route.id ? 0.5 : 1,
                              cursor: rejecting === route.id ? 'default' : 'pointer',
                            }}
                          >
                            {rejecting === route.id ? '...' : 'Rechazar'}
                          </button>
                        )}

                        {/* Confirm load */}
                        {(!route.load_sealed && (route.state !== 'draft' || hasLoadPicking)) && (
                          <button
                            onClick={(e) => { e.stopPropagation(); if (canConfirm && !isConfirming && !stockLoading) setConfirmRoute(route) }}
                            disabled={isConfirming || stockLoading || stockInsufficient}
                            style={{
                              flex: 1, padding: 12, borderRadius: TOKENS.radius.lg,
                              background: stockInsufficient
                                ? 'rgba(239,68,68,0.15)'
                                : 'linear-gradient(90deg, #15499B, #2B8FE0)',
                              color: stockInsufficient ? '#ef4444' : 'white',
                              fontSize: 14, fontWeight: 600,
                              opacity: (isConfirming || stockLoading) ? 0.5 : 1,
                              cursor: (isConfirming || stockLoading || stockInsufficient) ? 'default' : 'pointer',
                              border: stockInsufficient ? '1px solid rgba(239,68,68,0.30)' : 'none',
                              boxShadow: stockInsufficient ? 'none' : '0 8px 20px rgba(43,143,224,0.25)',
                              transition: `opacity ${TOKENS.motion.fast}`,
                            }}
                          >
                            {isConfirming ? 'Confirmando...' : stockLoading ? 'Verificando stock...' : stockInsufficient ? 'Sin stock suficiente' : 'Confirmar Carga'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div style={{ height: 32 }} />

      {/* Confirm dialog */}
      {confirmRoute && (
        <ConfirmDialog
          open
          title="Confirmar carga"
          message={`Confirmar que la carga de la ruta "${confirmRoute.name || confirmRoute.id}" fue despachada?`}
          confirmLabel="Confirmar"
          confirmColor={TOKENS.colors.blue2}
          onConfirm={handleConfirmLoad}
          onCancel={() => setConfirmRoute(null)}
        />
      )}

      {/* Reject dialog */}
      {rejectRoute && (
        <ConfirmDialog
          open
          title="Rechazar carga"
          message={`¿Rechazar la carga de la ruta "${rejectRoute.name || rejectRoute.id}"? Esto cancelará el picking y deberá re-generarse.`}
          confirmLabel="Rechazar"
          confirmColor="#ef4444"
          onConfirm={handleRejectLoad}
          onCancel={() => setRejectRoute(null)}
        />
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
          zIndex: 1100, padding: '10px 20px', borderRadius: TOKENS.radius.pill,
          background: toast.type === 'error' ? 'rgba(239,68,68,0.92)' : 'rgba(34,197,94,0.92)',
          color: '#fff', fontSize: 13, fontWeight: 600,
          boxShadow: TOKENS.shadow.md, animation: 'toast-in 0.25s ease',
          whiteSpace: 'nowrap',
        }}>
          {toast.msg}
        </div>
      )}
    </ScreenShell>
  )
}
