import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../App'
import { TOKENS, getTypo } from '../../tokens'
import {
  getForecastProducts,
  createForecast,
  getForecasts,
  confirmForecast,
  cancelForecast,
  deleteForecast,
  getForecastLines,
  updateForecastLines,
  getRouteTemplatesForPlanning,
  ensureDailyRoutePlan,
  getPlanningPolygons,
  getPlanningSubpolygons,
  getPlanningChannels,
  getPlanningTimeWindows,
  // F4-E.2: Plan Maestro Semanal — sugerencias y confirmacion de recursos
  getBranchConfigs,
  getRouteSuggestions,
  confirmRouteSuggestion,
} from './api'
import {
  buildRoutePlanCriteriaPayload,
  buildRouteForecastPayload,
  DEMAND_CLASSES,
  getDefaultTimeWindow,
  getDemandClassesSummary,
  getPlanningDateBounds,
  getSupervisorRouteErrorMessage,
  isFuturePlanningDate,
  normalizeRoutePlanningRow,
  sanitizeDemandClasses,
} from './routePlanning'
import { logScreenError } from '../shared/logScreenError'

const CHANNELS = ['Van', 'Mostrador']
const VISIT_DAYS = [
  { id: 'monday', label: 'Lun' },
  { id: 'tuesday', label: 'Mar' },
  { id: 'wednesday', label: 'Mie' },
  { id: 'thursday', label: 'Jue' },
  { id: 'friday', label: 'Vie' },
  { id: 'saturday', label: 'Sab' },
  { id: 'sunday', label: 'Dom' },
]

// Bottom-sheet oscuro con buscador. Reemplaza <select> nativo en móvil.
// Recibe { id, label } y devuelve la opción completa al onSelect.
function SearchableSheet({
  open,
  onClose,
  title,
  placeholder = 'Buscar…',
  options,
  selectedId,
  onSelect,
  emptyText = 'No se encontraron resultados',
}) {
  const [q, setQ] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    if (!open) { setQ(''); return }
    // Pequeño delay para que el sheet esté visible antes de pedir foco — evita
    // que el teclado del móvil empuje la animación de entrada.
    const t = setTimeout(() => inputRef.current?.focus(), 60)
    return () => clearTimeout(t)
  }, [open])

  // Cierre con Escape (teclado físico / accesibilidad básica)
  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return options
    return options.filter(o => (o.label || '').toLowerCase().includes(needle))
  }, [q, options])

  if (!open) return null

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        backdropFilter: 'blur(2px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{
          width: '100%', maxWidth: 480,
          maxHeight: '85dvh', display: 'flex', flexDirection: 'column',
          background: TOKENS.colors.bg1,
          borderTopLeftRadius: TOKENS.radius.xl,
          borderTopRightRadius: TOKENS.radius.xl,
          border: `1px solid ${TOKENS.colors.border}`,
          boxShadow: TOKENS.shadow.lg,
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {/* Grabber + header */}
        <div style={{ padding: '10px 16px 6px' }}>
          <div style={{
            width: 40, height: 4, borderRadius: 999,
            background: 'rgba(255,255,255,0.18)', margin: '0 auto 10px',
          }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: TOKENS.colors.text }}>{title}</span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              style={{
                width: 32, height: 32, borderRadius: TOKENS.radius.sm,
                background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>

        {/* Search */}
        <div style={{ padding: '8px 16px 10px' }}>
          <input
            ref={inputRef}
            type="text"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder={placeholder}
            style={{
              width: '100%', padding: '12px 14px', borderRadius: TOKENS.radius.md,
              background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
              color: TOKENS.colors.text, fontSize: 14, outline: 'none',
              fontFamily: "'DM Sans', sans-serif",
            }}
          />
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 8px' }}>
          {filtered.length === 0 ? (
            <div style={{
              padding: 24, textAlign: 'center', color: TOKENS.colors.textLow, fontSize: 13,
            }}>
              {emptyText}
            </div>
          ) : (
            filtered.map(opt => {
              const active = selectedId != null && String(opt.id) === String(selectedId)
              return (
                <button
                  key={opt.id ?? '__null'}
                  type="button"
                  onClick={() => { onSelect?.(opt); onClose?.() }}
                  style={{
                    width: '100%', minHeight: 48, padding: '10px 14px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                    borderRadius: TOKENS.radius.sm,
                    background: active ? TOKENS.colors.blueGlow : 'transparent',
                    border: active ? `1px solid ${TOKENS.colors.blue2}` : '1px solid transparent',
                    color: TOKENS.colors.text, fontSize: 14, textAlign: 'left',
                    fontFamily: "'DM Sans', sans-serif", marginBottom: 2,
                  }}
                >
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {opt.label}
                  </span>
                  {active && (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={TOKENS.colors.blue3} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  )}
                </button>
              )
            })
          )}
        </div>

        {/* Cancel footer */}
        <div style={{ padding: '8px 16px 12px', borderTop: `1px solid ${TOKENS.colors.border}` }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: '100%', minHeight: 44, padding: '10px 0', borderRadius: TOKENS.radius.md,
              background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
              color: TOKENS.colors.textSoft, fontSize: 13, fontWeight: 600,
            }}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ScreenPronostico() {
  const { session } = useSession()
  const navigate = useNavigate()
  const [sw, setSw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])
  const [products, setProducts] = useState([])
  const [forecasts, setForecasts] = useState([])
  const [routes, setRoutes] = useState([])
  const [polygons, setPolygons] = useState([])
  const [subpolygons, setSubpolygons] = useState([])
  const [planningChannels, setPlanningChannels] = useState([])
  const [timeWindows, setTimeWindows] = useState([])
  const [planningDateBounds] = useState(() => getPlanningDateBounds())
  const [dateTarget, setDateTarget] = useState(() => planningDateBounds.defaultDate)
  const [lines, setLines] = useState([{ product_id: '', channel: 'Van', qty: '' }])
  const [selectedRouteId, setSelectedRouteId] = useState(null)
  const [selectedPolygonId, setSelectedPolygonId] = useState('')
  const [selectedSubpolygonId, setSelectedSubpolygonId] = useState('')
  const [selectedChannelIds, setSelectedChannelIds] = useState([])
  const [selectedVisitDays, setSelectedVisitDays] = useState([])
  const [selectedTimeWindowId, setSelectedTimeWindowId] = useState('')
  // F1: clasificación de demanda (AA/A/B/C). Vacío = todas las clases.
  const [selectedDemandClasses, setSelectedDemandClasses] = useState([])
  const [routeLoading, setRouteLoading] = useState(null)
  const [routeError, setRouteError] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [msg, setMsg] = useState(null)

  // Sheet state. `productLineIdx` indica qué línea se está editando.
  const [productLineIdx, setProductLineIdx] = useState(null)

  // Expand / edit forecast lines
  const [expandedForecastId, setExpandedForecastId] = useState(null)
  const [forecastLinesCache, setForecastLinesCache] = useState({})
  const [forecastLinesLoading, setForecastLinesLoading] = useState(null)
  const [editingForecastId, setEditingForecastId] = useState(null)
  const [editLines, setEditLines] = useState([])
  const [editProductLineIdx, setEditProductLineIdx] = useState(null)
  const [editSubmitting, setEditSubmitting] = useState(false)

  // ── F4-E.2: Plan Maestro Semanal — toggle + sugerencias ─────────────
  // Toggle entre flujo manual (existente, intacto) y nuevo flujo de
  // sugerencias derivadas del weekly plan (gf.route.weekly.plan.line).
  // El flujo manual NO se rompe; ambos modos coexisten.
  const [planMode, setPlanMode] = useState('manual') // 'manual' | 'plan_maestro'
  const [branchConfigs, setBranchConfigs] = useState([])
  const [branchConfigsLoaded, setBranchConfigsLoaded] = useState(false)
  const [selectedBranchConfigId, setSelectedBranchConfigId] = useState(null)
  const [pmPlan, setPmPlan] = useState(null) // {weekly_plan_id, name, state, target_date}
  const [pmSuggestions, setPmSuggestions] = useState([])
  const [pmLoading, setPmLoading] = useState(false)
  const [pmError, setPmError] = useState(null) // {code, message} or null
  const [pmWarning, setPmWarning] = useState(null) // string (out-of-range)
  // Per-card form state: { [lineId]: { driverId, vehicleId, salespersonId,
  //   warehouseDispatchId, mobileLocationId, departureTime, saving, error,
  //   savedRouteId, savedRouteName } }
  const [pmCardState, setPmCardState] = useState({})

  const productOptions = useMemo(
    () => products.map(p => ({ id: String(p.id), label: p.name || p.display_name || `#${p.id}` })),
    [products],
  )

  const selectedRoute = useMemo(
    () => routes.find((r) => Number(r.route_id) === Number(selectedRouteId)) || null,
    [routes, selectedRouteId],
  )
  const defaultTimeWindow = useMemo(() => getDefaultTimeWindow(), [])

  const routesWithPlan = routes.filter((r) => r.plan_id).length
  const routesWithoutPlan = routes.length - routesWithPlan
  const warehouseLabel = session?.warehouse_name || session?.warehouse || (session?.warehouse_id ? `CEDIS #${session.warehouse_id}` : 'CEDIS no asignado')

  function productLabelForLine(line) {
    if (!line.product_id) return null
    const p = products.find(x => String(x.id) === String(line.product_id))
    return p?.name || p?.display_name || `Producto #${line.product_id}`
  }

  function productNameForId(productId) {
    if (!productId) return ''
    const p = products.find(x => String(x.id) === String(productId))
    return p?.name || p?.display_name || `#${productId}`
  }

  function unwrapList(payload) {
    const value = payload?.data ?? payload
    if (Array.isArray(value)) return value
    if (Array.isArray(value?.items)) return value.items
    if (Array.isArray(value?.records)) return value.records
    return []
  }

  function optionId(row) {
    if (String(row?.key || '').toLowerCase() === 'any') return ''
    return String(row.id ?? row.value ?? row.key ?? '')
  }

  function optionLabel(row, fallback = '') {
    return row.name || row.label || row.display_name || fallback || optionId(row)
  }

  async function handleToggleExpand(forecastId) {
    if (expandedForecastId === forecastId) {
      setExpandedForecastId(null)
      return
    }
    setExpandedForecastId(forecastId)
    if (!forecastLinesCache[forecastId]) {
      setForecastLinesLoading(forecastId)
      try {
        const fLines = await getForecastLines(forecastId)
        setForecastLinesCache(prev => ({ ...prev, [forecastId]: fLines }))
      } catch (e) {
        logScreenError('ScreenPronostico', 'getForecastLines', e)
        setForecastLinesCache(prev => ({ ...prev, [forecastId]: [] }))
      } finally {
        setForecastLinesLoading(null)
      }
    }
  }

  function handleStartEdit(forecast) {
    const cached = forecastLinesCache[forecast.id] || []
    setEditLines(cached.length
      ? cached.map(l => ({
          product_id: String(l.product_id),
          channel: l.channel === 'counter' ? 'Mostrador' : 'Van',
          qty: String(l.qty),
        }))
      : [{ product_id: '', channel: 'Van', qty: '' }])
    setEditingForecastId(forecast.id)
  }

  function handleCancelEdit() {
    setEditingForecastId(null)
    setEditLines([])
  }

  function updateEditLine(idx, field, value) {
    setEditLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l))
  }

  function addEditLine() {
    setEditLines(prev => [...prev, { product_id: '', channel: 'Van', qty: '' }])
  }

  function removeEditLine(idx) {
    if (editLines.length <= 1) return
    setEditLines(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleSaveEdit(forecastId) {
    const validLines = editLines.filter(l => l.product_id && Number(l.qty) > 0)
    if (validLines.length === 0) { flashMsg('Agrega al menos un producto'); return }
    setEditSubmitting(true)
    try {
      await updateForecastLines(forecastId, validLines)
      // Refresh lines cache for this forecast
      const refreshed = await getForecastLines(forecastId)
      setForecastLinesCache(prev => ({ ...prev, [forecastId]: refreshed }))
      setEditingForecastId(null)
      setEditLines([])
      flashMsg('Pronostico actualizado')
    } catch (e) {
      flashMsg(e.message || 'Error al guardar', 5000)
    } finally {
      setEditSubmitting(false)
    }
  }

  useEffect(() => {
    const h = () => setSw(window.innerWidth)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])

  // Ref para cancelar cualquier timeout pendiente al desmontar (evita setState
  // sobre componente desmontado y memory leaks en Fast Refresh).
  const msgTimerRef = useRef(null)
  useEffect(() => () => {
    if (msgTimerRef.current) clearTimeout(msgTimerRef.current)
  }, [])

  function flashMsg(text, ms = 3000) {
    setMsg(text)
    if (msgTimerRef.current) clearTimeout(msgTimerRef.current)
    msgTimerRef.current = setTimeout(() => setMsg(null), ms)
  }

  const loadData = useCallback(async () => {
    setLoading(true)
    setRouteError('')
    try {
      const [p, f, routeRows, polygonRows, channelRows, timeWindowRows] = await Promise.all([
        getForecastProducts().catch((e) => { logScreenError('ScreenPronostico', 'getForecastProducts', e); return [] }),
        getForecasts().catch((e) => { logScreenError('ScreenPronostico', 'getForecasts', e); return [] }),
        getRouteTemplatesForPlanning(dateTarget).catch((e) => {
          logScreenError('ScreenPronostico', 'getRouteTemplatesForPlanning', e)
          setRouteError(e?.message || 'Error al cargar rutas del CEDIS')
          return []
        }),
        getPlanningPolygons().catch((e) => { logScreenError('ScreenPronostico', 'getPlanningPolygons', e); return [] }),
        getPlanningChannels().catch((e) => { logScreenError('ScreenPronostico', 'getPlanningChannels', e); return [] }),
        getPlanningTimeWindows().catch((e) => { logScreenError('ScreenPronostico', 'getPlanningTimeWindows', e); return [] }),
      ])
      const normalizedRoutes = (Array.isArray(routeRows) ? routeRows : []).map(normalizeRoutePlanningRow)
      const normalizedPolygons = unwrapList(polygonRows)
      setProducts(p || [])
      setForecasts(f || [])
      setRoutes(normalizedRoutes)
      setPolygons(normalizedPolygons)
      setPlanningChannels(unwrapList(channelRows))
      setTimeWindows([defaultTimeWindow, ...unwrapList(timeWindowRows).filter((row) => String(row.key || row.id || '') !== 'any')])
      setSelectedRouteId((current) => {
        if (current && normalizedRoutes.some((r) => Number(r.route_id) === Number(current))) return current
        return normalizedRoutes.find((r) => r.plan_id)?.route_id || normalizedRoutes[0]?.route_id || null
      })
      setSelectedPolygonId((current) => {
        if (current && normalizedPolygons.some((p) => optionId(p) === String(current))) return current
        return normalizedPolygons[0] ? optionId(normalizedPolygons[0]) : ''
      })
    } catch (e) { logScreenError('ScreenPronostico', 'loadData', e) }
    finally { setLoading(false) }
  }, [dateTarget, defaultTimeWindow])

  useEffect(() => { loadData() }, [loadData])

  useEffect(() => {
    let cancelled = false
    async function loadSubpolygons() {
      setSelectedSubpolygonId('')
      if (!selectedPolygonId) {
        setSubpolygons([])
        return
      }
      try {
        const rows = await getPlanningSubpolygons(selectedPolygonId)
        if (!cancelled) setSubpolygons(unwrapList(rows))
      } catch (e) {
        logScreenError('ScreenPronostico', 'getPlanningSubpolygons', e)
        if (!cancelled) setSubpolygons([])
      }
    }
    loadSubpolygons()
    return () => { cancelled = true }
  }, [selectedPolygonId])

  function updateLine(idx, field, value) {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l))
  }

  function addLine() {
    setLines(prev => [...prev, { product_id: '', channel: 'Van', qty: '' }])
  }

  function removeLine(idx) {
    if (lines.length <= 1) return
    setLines(prev => prev.filter((_, i) => i !== idx))
  }

  function handleChannelToggle(channelId) {
    setSelectedChannelIds(prev => prev.includes(channelId)
      ? prev.filter((id) => id !== channelId)
      : [...prev, channelId])
  }

  function handleVisitDayToggle(dayId) {
    setSelectedVisitDays(prev => prev.includes(dayId)
      ? prev.filter((id) => id !== dayId)
      : [...prev, dayId])
  }

  function handleDemandClassToggle(value) {
    setSelectedDemandClasses(prev => sanitizeDemandClasses(
      prev.includes(value) ? prev.filter((c) => c !== value) : [...prev, value]
    ))
  }

  function handleDateTargetChange(value) {
    if (!isFuturePlanningDate(value)) {
      flashMsg('Selecciona una fecha de manana en adelante', 4000)
      return
    }
    setDateTarget(value)
    setSelectedRouteId(null)
    setExpandedForecastId(null)
    setForecastLinesCache({})
    setEditingForecastId(null)
    setMsg(null)
  }

  function buildCurrentPlanCriteria(routeId) {
    return buildRoutePlanCriteriaPayload({
      routeId,
      dateTarget,
      polygonId: selectedPolygonId,
      subpolygonId: selectedSubpolygonId,
      channelIds: selectedChannelIds,
      visitDays: selectedVisitDays,
      timeWindowId: selectedTimeWindowId,
      demandClasses: selectedDemandClasses,
    })
  }

  async function handleSubmit() {
    const validLines = lines.filter(l => l.product_id && l.qty > 0)
    if (validLines.length === 0) { setMsg('Agrega al menos un producto'); return }
    if (!selectedRoute) { setMsg('Selecciona una ruta'); return }
    if (!selectedRoute.plan_id) { setMsg('Primero crea el plan diario de la ruta'); return }

    setSubmitting(true)
    setMsg(null)
    try {
      const forecastData = buildRouteForecastPayload({
        routeId: selectedRoute.route_id,
        planId: selectedRoute.plan_id,
        dateTarget,
        lines: validLines,
      })
      await createForecast(forecastData)
      setMsg('Pronostico guardado')
      setLines([{ product_id: '', channel: 'Van', qty: '' }])
      await loadData()
    } catch (e) {
      setMsg(e.message || 'Error al guardar')
    } finally { setSubmitting(false) }
  }

  async function handleEnsurePlan(route) {
    if (!route?.route_id) return
    setRouteLoading(route.route_id)
    setMsg(null)
    try {
      const res = await ensureDailyRoutePlan(route.route_id, dateTarget, buildCurrentPlanCriteria(route.route_id))
      if (res?.ok === false) {
        flashMsg(getSupervisorRouteErrorMessage(res), 5000)
        return
      }
      await loadData()
      setSelectedRouteId(route.route_id)
      flashMsg('Plan diario listo')
    } catch (e) {
      flashMsg(getSupervisorRouteErrorMessage(e), 5000)
    } finally {
      setRouteLoading(null)
    }
  }

  // ── F4-E.2: Plan Maestro Semanal — helpers + effects ─────────────────

  function pmTranslateErrorCode(code, fallback = '') {
    const map = {
      forbidden: 'No tienes permisos para ver/editar sugerencias del plan maestro',
      weekly_plan_not_found: 'No hay plan maestro para esta fecha en esta sucursal',
      weekly_plan_ambiguous: 'Conflicto: multiples planes para esta fecha — contactar Yamil',
      weekly_plan_not_editable: 'Este plan no es editable (publicado/cerrado/cancelado)',
      weekly_plan_line_not_found: 'La linea ya no existe (refrescar)',
      missing_required_fields: 'Faltan campos requeridos (chofer y camioneta)',
      invalid_payload: 'Datos invalidos',
      route_not_found: 'Chofer + camioneta no resuelven a una ruta activa',
      route_ambiguous: 'Multiples rutas posibles para chofer+camioneta — pedir a Yamil/Sebas escoger',
      write_error: 'Error al guardar — reintentar',
      read_error: 'Error leyendo branch configs — reintentar',
    }
    return map[code] || fallback || 'Error desconocido'
  }

  function pmCardFor(lineId) {
    return pmCardState[lineId] || {
      driverId: '',
      vehicleId: '',
      salespersonId: '',
      warehouseDispatchId: '',
      mobileLocationId: '',
      departureTime: '',
      saving: false,
      error: null,
      savedRouteId: null,
      savedRouteName: null,
    }
  }

  function updatePmCard(lineId, partial) {
    setPmCardState((prev) => ({
      ...prev,
      [lineId]: { ...pmCardFor(lineId), ...partial },
    }))
  }

  function pmSeedCardFromSuggestion(suggestion) {
    return {
      driverId: suggestion.planned_driver_id ? String(suggestion.planned_driver_id) : '',
      vehicleId: suggestion.planned_vehicle_id ? String(suggestion.planned_vehicle_id) : '',
      salespersonId: suggestion.planned_salesperson_id ? String(suggestion.planned_salesperson_id) : '',
      warehouseDispatchId: suggestion.planned_warehouse_dispatch_id ? String(suggestion.planned_warehouse_dispatch_id) : '',
      mobileLocationId: suggestion.planned_mobile_location_id ? String(suggestion.planned_mobile_location_id) : '',
      departureTime: suggestion.planned_departure_time
        ? String(suggestion.planned_departure_time)
        : '',
      saving: false,
      error: null,
      savedRouteId: suggestion.resolved_route_id || null,
      savedRouteName: null,
    }
  }

  const loadBranchConfigs = useCallback(async () => {
    try {
      const resp = await getBranchConfigs()
      const list = (resp?.data?.branch_configs || []).filter((bc) => bc.state === 'active')
      setBranchConfigs(list)
      setBranchConfigsLoaded(true)
      // Pre-select primero si solo hay uno
      setSelectedBranchConfigId((current) => {
        if (current) return current
        return list.length === 1 ? list[0].id : null
      })
    } catch (e) {
      logScreenError('ScreenPronostico', 'getBranchConfigs', e)
      setBranchConfigs([])
      setBranchConfigsLoaded(true)
    }
  }, [])

  const loadPmSuggestions = useCallback(async () => {
    if (planMode !== 'plan_maestro') return
    if (!selectedBranchConfigId) {
      setPmSuggestions([])
      setPmPlan(null)
      setPmError(null)
      setPmWarning(null)
      return
    }
    setPmLoading(true)
    setPmError(null)
    setPmWarning(null)
    try {
      const resp = await getRouteSuggestions({
        date: dateTarget,
        branchConfigId: selectedBranchConfigId,
      })
      if (resp?.ok === false) {
        const code = resp?.data?.code || 'unknown'
        setPmError({
          code,
          message: pmTranslateErrorCode(code, resp?.message),
        })
        setPmSuggestions([])
        setPmPlan(null)
        return
      }
      const data = resp?.data || {}
      const suggestions = Array.isArray(data.suggestions) ? data.suggestions : []
      setPmPlan({
        weekly_plan_id: data.weekly_plan_id,
        weekly_plan_name: data.weekly_plan_name,
        weekly_plan_state: data.weekly_plan_state,
        target_date: data.target_date,
        week_start_date: data.week_start_date,
        week_end_date: data.week_end_date,
      })
      setPmSuggestions(suggestions)
      // Seed card state from incoming suggestions (preserve user-typed
      // values for cards en edicion).
      setPmCardState((prev) => {
        const next = { ...prev }
        for (const s of suggestions) {
          if (!next[s.weekly_plan_line_id]) {
            next[s.weekly_plan_line_id] = pmSeedCardFromSuggestion(s)
          }
        }
        return next
      })
      // Warning para out-of-range (resp.message poblado por backend)
      if (resp?.message && suggestions.length === 0) {
        setPmWarning(resp.message)
      }
    } catch (e) {
      logScreenError('ScreenPronostico', 'getRouteSuggestions', e)
      const code = e?.data?.code || e?.code
      setPmError({
        code: code || 'unknown',
        message: pmTranslateErrorCode(code, e?.message || 'Error al cargar sugerencias'),
      })
      setPmSuggestions([])
      setPmPlan(null)
    } finally {
      setPmLoading(false)
    }
  }, [planMode, selectedBranchConfigId, dateTarget])

  useEffect(() => { loadBranchConfigs() }, [loadBranchConfigs])
  useEffect(() => { loadPmSuggestions() }, [loadPmSuggestions])

  async function handlePmConfirm(suggestion) {
    const lineId = suggestion.weekly_plan_line_id
    const card = pmCardFor(lineId)
    const driverId = Number(card.driverId || 0)
    const vehicleId = Number(card.vehicleId || 0)
    if (!driverId || !vehicleId) {
      updatePmCard(lineId, {
        error: pmTranslateErrorCode('missing_required_fields'),
      })
      return
    }
    updatePmCard(lineId, { saving: true, error: null })
    try {
      const payload = {
        weekly_plan_line_id: lineId,
        planned_driver_id: driverId,
        planned_vehicle_id: vehicleId,
      }
      if (card.salespersonId) payload.planned_salesperson_id = Number(card.salespersonId)
      if (card.warehouseDispatchId) payload.planned_warehouse_dispatch_id = Number(card.warehouseDispatchId)
      if (card.mobileLocationId) payload.planned_mobile_location_id = Number(card.mobileLocationId)
      if (card.departureTime) {
        const t = parseFloat(card.departureTime)
        if (!Number.isNaN(t)) payload.planned_departure_time = t
      }
      const resp = await confirmRouteSuggestion(payload)
      if (resp?.ok === false) {
        const code = resp?.data?.code || 'unknown'
        updatePmCard(lineId, {
          saving: false,
          error: pmTranslateErrorCode(code, resp?.message),
        })
        return
      }
      const data = resp?.data || {}
      updatePmCard(lineId, {
        saving: false,
        error: null,
        savedRouteId: data.resolved_route_id || null,
        savedRouteName: data.resolved_route_name || null,
      })
      // Refrescar sugerencias para reflejar el cambio
      await loadPmSuggestions()
      flashMsg(`Recursos confirmados (ruta ${data.resolved_route_name || data.resolved_route_id})`)
    } catch (e) {
      logScreenError('ScreenPronostico', 'confirmRouteSuggestion', e)
      const code = e?.data?.code || e?.code
      updatePmCard(lineId, {
        saving: false,
        error: pmTranslateErrorCode(code, e?.message || 'Error al confirmar'),
      })
    }
  }

  const [actionLoading, setActionLoading] = useState(null) // forecast id being acted on

  async function handleConfirm(forecastId) {
    setActionLoading(forecastId)
    try {
      await confirmForecast(forecastId)
      await loadData()
      flashMsg('Pronostico confirmado')
    } catch (e) {
      flashMsg(e.message || 'Error al confirmar', 5000)
    } finally { setActionLoading(null) }
  }

  async function handleCancel(forecastId) {
    setActionLoading(forecastId)
    try {
      await cancelForecast(forecastId)
      await loadData()
      flashMsg('Pronostico regresado a borrador')
    } catch (e) {
      flashMsg(e.message || 'Error al cancelar', 5000)
    } finally { setActionLoading(null) }
  }

  async function handleDelete(forecastId) {
    setActionLoading(forecastId)
    try {
      await deleteForecast(forecastId)
      await loadData()
      flashMsg('Pronostico eliminado')
    } catch (e) {
      flashMsg(e.message || 'Error al eliminar', 5000)
    } finally { setActionLoading(null) }
  }

  function statusColor(status) {
    if (status === 'confirmed' || status === 'done') return TOKENS.colors.success
    if (status === 'draft') return TOKENS.colors.warning
    return TOKENS.colors.textMuted
  }

  function statusLabel(status) {
    if (status === 'confirmed') return 'Confirmado'
    if (status === 'done') return 'Realizado'
    if (status === 'draft') return 'Borrador'
    return status || 'draft'
  }

  function routeStateColor(state) {
    if (state === 'load_executed') return TOKENS.colors.success
    if (state === 'load_ready' || state === 'forecast_confirmed') return TOKENS.colors.blue2
    if (state === 'plan_draft') return TOKENS.colors.warning
    if (state === 'blocked') return TOKENS.colors.error
    return TOKENS.colors.textMuted
  }

  function routeStateLabel(state) {
    if (state === 'sin_plan') return 'Sin plan'
    if (state === 'plan_draft') return 'Plan creado'
    if (state === 'forecast_confirmed') return 'Forecast confirmado'
    if (state === 'load_ready') return 'Carga lista'
    if (state === 'load_executed') return 'Carga ejecutada'
    if (state === 'blocked') return 'Bloqueada'
    return state || 'Sin estado'
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
        select, input { font-family: 'DM Sans', sans-serif; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 20, paddingBottom: 12 }}>
          <button onClick={() => navigate('/equipo')} style={{
            width: 38, height: 38, borderRadius: TOKENS.radius.md,
            background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
          </button>
          <span style={{ ...typo.title, color: TOKENS.colors.textSoft }}>Pronostico</span>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
            <div style={{ width: 32, height: 32, border: '2px solid rgba(255,255,255,0.12)', borderTop: '2px solid #2B8FE0', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : (
          <>
            {/* F4-E.2: Toggle modo manual vs plan maestro */}
            <div style={{
              marginTop: 8, marginBottom: 8, padding: 4, borderRadius: TOKENS.radius.pill,
              background: TOKENS.colors.surfaceSoft, border: `1px solid ${TOKENS.colors.border}`,
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4,
            }}>
              {[
                { key: 'manual', label: 'Crear ruta manual' },
                { key: 'plan_maestro', label: 'Sugerencia plan maestro' },
              ].map((opt) => {
                const active = planMode === opt.key
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setPlanMode(opt.key)}
                    style={{
                      minHeight: 44, padding: '10px 12px', borderRadius: TOKENS.radius.pill,
                      background: active ? TOKENS.colors.blue2 : 'transparent',
                      color: active ? '#fff' : TOKENS.colors.textMuted,
                      fontSize: 12, fontWeight: 700, letterSpacing: 0.2,
                    }}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>

            {/* F4-E.2: Seccion Plan Maestro (visible solo en modo plan_maestro) */}
            {planMode === 'plan_maestro' && (
              <div style={{
                marginTop: 8, padding: 16, borderRadius: TOKENS.radius.xl,
                background: TOKENS.glass.hero, border: `1px solid ${TOKENS.colors.borderBlue}`,
                boxShadow: `${TOKENS.shadow.md}, ${TOKENS.shadow.inset}`,
              }}>
                <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginBottom: 14 }}>SUGERENCIAS DEL PLAN MAESTRO SEMANAL</p>

                {/* Branch picker (auto-selecciona si solo hay uno) */}
                {branchConfigsLoaded && branchConfigs.length > 1 && (
                  <div style={{
                    marginBottom: 12, padding: 10, borderRadius: TOKENS.radius.md,
                    background: TOKENS.colors.surfaceSoft, border: `1px solid ${TOKENS.colors.border}`,
                  }}>
                    <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, fontSize: 10 }}>SUCURSAL</p>
                    <select
                      value={selectedBranchConfigId || ''}
                      onChange={(e) => setSelectedBranchConfigId(Number(e.target.value) || null)}
                      style={{
                        width: '100%', marginTop: 4, padding: '10px 8px', borderRadius: TOKENS.radius.sm,
                        background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
                        color: TOKENS.colors.text, fontSize: 12, outline: 'none',
                      }}
                    >
                      <option value="">— elegir —</option>
                      {branchConfigs.map((bc) => (
                        <option key={bc.id} value={bc.id}>
                          {bc.display_name || `Branch #${bc.id}`}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {!branchConfigsLoaded && (
                  <p style={{ ...typo.caption, color: TOKENS.colors.textLow, fontSize: 12 }}>
                    Cargando sucursales...
                  </p>
                )}

                {branchConfigsLoaded && branchConfigs.length === 0 && (
                  <p style={{ ...typo.caption, color: TOKENS.colors.warning, fontSize: 12 }}>
                    No hay sucursales disponibles. Pedir permisos al admin.
                  </p>
                )}

                {/* Plan info */}
                {pmPlan && (
                  <div style={{
                    marginBottom: 12, padding: 10, borderRadius: TOKENS.radius.md,
                    background: 'rgba(43,143,224,0.08)', border: '1px solid rgba(43,143,224,0.22)',
                  }}>
                    <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, fontSize: 10 }}>
                      PLAN MAESTRO
                    </p>
                    <p style={{ ...typo.title, color: TOKENS.colors.text, margin: '2px 0 0', fontSize: 13 }}>
                      {pmPlan.weekly_plan_name} · {pmPlan.weekly_plan_state}
                    </p>
                    <p style={{ ...typo.caption, color: TOKENS.colors.textLow, margin: '2px 0 0', fontSize: 11 }}>
                      Semana {pmPlan.week_start_date} → {pmPlan.week_end_date}
                    </p>
                  </div>
                )}

                {pmLoading && (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}>
                    <div style={{ width: 24, height: 24, border: '2px solid rgba(255,255,255,0.12)', borderTop: '2px solid #2B8FE0', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                  </div>
                )}

                {pmError && (
                  <div style={{
                    marginBottom: 12, padding: 10, borderRadius: TOKENS.radius.md,
                    background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.32)',
                  }}>
                    <p style={{ ...typo.caption, color: '#ef4444', margin: 0, fontSize: 11, fontWeight: 600 }}>
                      {pmError.message}
                    </p>
                    <p style={{ ...typo.caption, color: TOKENS.colors.textLow, margin: '2px 0 0', fontSize: 10 }}>
                      code: {pmError.code}
                    </p>
                  </div>
                )}

                {pmWarning && !pmError && (
                  <div style={{
                    marginBottom: 12, padding: 10, borderRadius: TOKENS.radius.md,
                    background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.32)',
                  }}>
                    <p style={{ ...typo.caption, color: '#f59e0b', margin: 0, fontSize: 11, fontWeight: 600 }}>
                      {pmWarning}
                    </p>
                  </div>
                )}

                {!pmLoading && !pmError && pmSuggestions.length === 0 && pmPlan && (
                  <p style={{ ...typo.caption, color: TOKENS.colors.textLow, fontSize: 12, padding: '10px 0' }}>
                    Sin sugerencias para esta fecha.
                  </p>
                )}

                {!pmLoading && pmSuggestions.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {pmSuggestions.map((s) => {
                      const card = pmCardFor(s.weekly_plan_line_id)
                      const isResolved = !!card.savedRouteId || s.route_resolution_status === 'resolved'
                      const opts = Array.isArray(s.valid_route_options) ? s.valid_route_options : []
                      const drivers = Array.from(new Map(opts
                        .filter((o) => o.driver_employee_id)
                        .map((o) => [o.driver_employee_id, { id: o.driver_employee_id, name: o.driver_name }])).values())
                      const vehicles = Array.from(new Map(opts
                        .filter((o) => o.vehicle_id)
                        .map((o) => [o.vehicle_id, { id: o.vehicle_id, name: o.vehicle_name }])).values())
                      return (
                        <div key={s.weekly_plan_line_id} style={{
                          padding: 12, borderRadius: TOKENS.radius.md,
                          background: isResolved ? 'rgba(34,197,94,0.06)' : TOKENS.colors.surfaceSoft,
                          border: `1px solid ${isResolved ? 'rgba(34,197,94,0.32)' : TOKENS.colors.border}`,
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                            <p style={{ ...typo.title, color: TOKENS.colors.text, margin: 0, fontSize: 13 }}>
                              {s.polygon_code} {s.subpolygon_code ? `· ${s.subpolygon_code}` : ''}
                            </p>
                            <p style={{ ...typo.caption, color: TOKENS.colors.textLow, margin: 0, fontSize: 11 }}>
                              run #{s.run_number || 1} · {s.shift_type || 'mixed'}
                            </p>
                          </div>
                          <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '0 0 4px', fontSize: 11 }}>
                            {s.planned_customer_count} clientes esperados · salida {s.planned_departure_time?.toFixed?.(1) || s.planned_departure_time}h
                          </p>
                          {s.capacity_warning && (
                            <p style={{ ...typo.caption, color: '#f59e0b', margin: '0 0 6px', fontSize: 10 }}>
                              ⚠ {s.capacity_warning}
                            </p>
                          )}
                          {isResolved ? (
                            <p style={{ ...typo.caption, color: TOKENS.colors.success, margin: '6px 0 0', fontSize: 11, fontWeight: 600 }}>
                              ✓ Resuelta — ruta #{card.savedRouteId || s.resolved_route_id} {card.savedRouteName ? `(${card.savedRouteName})` : ''}
                            </p>
                          ) : (
                            <>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 8 }}>
                                <select
                                  value={card.driverId}
                                  onChange={(e) => updatePmCard(s.weekly_plan_line_id, { driverId: e.target.value, error: null })}
                                  disabled={card.saving}
                                  style={{
                                    minHeight: 44, padding: '8px', borderRadius: TOKENS.radius.sm,
                                    background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
                                    color: TOKENS.colors.text, fontSize: 12, outline: 'none',
                                  }}
                                >
                                  <option value="">— chofer —</option>
                                  {drivers.map((d) => (
                                    <option key={d.id} value={d.id}>{d.name || `#${d.id}`}</option>
                                  ))}
                                </select>
                                <select
                                  value={card.vehicleId}
                                  onChange={(e) => updatePmCard(s.weekly_plan_line_id, { vehicleId: e.target.value, error: null })}
                                  disabled={card.saving}
                                  style={{
                                    minHeight: 44, padding: '8px', borderRadius: TOKENS.radius.sm,
                                    background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
                                    color: TOKENS.colors.text, fontSize: 12, outline: 'none',
                                  }}
                                >
                                  <option value="">— camioneta —</option>
                                  {vehicles.map((v) => (
                                    <option key={v.id} value={v.id}>{v.name || `#${v.id}`}</option>
                                  ))}
                                </select>
                              </div>
                              {card.error && (
                                <p style={{ ...typo.caption, color: '#ef4444', margin: '6px 0 0', fontSize: 10 }}>
                                  {card.error}
                                </p>
                              )}
                              <button
                                type="button"
                                onClick={() => handlePmConfirm(s)}
                                disabled={card.saving || !card.driverId || !card.vehicleId}
                                style={{
                                  width: '100%', minHeight: 44, marginTop: 8, padding: '10px',
                                  borderRadius: TOKENS.radius.md,
                                  background: (card.driverId && card.vehicleId && !card.saving) ? TOKENS.colors.blue2 : TOKENS.colors.surface,
                                  color: (card.driverId && card.vehicleId && !card.saving) ? '#fff' : TOKENS.colors.textLow,
                                  border: `1px solid ${TOKENS.colors.border}`,
                                  fontSize: 12, fontWeight: 700, opacity: card.saving ? 0.6 : 1,
                                }}
                              >
                                {card.saving ? 'Confirmando...' : 'Confirmar recursos'}
                              </button>
                            </>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                <p style={{ ...typo.caption, color: TOKENS.colors.textLow, fontSize: 10, marginTop: 14 }}>
                  Confirmar recursos NO genera ruta diaria. Solo se guardan en el contrato semanal.
                </p>
              </div>
            )}

            {/* Form manual (visible solo en modo manual) */}
            {planMode === 'manual' && (
            <>
            {/* Form */}
            <div style={{
              marginTop: 8, padding: 16, borderRadius: TOKENS.radius.xl,
              background: TOKENS.glass.hero, border: `1px solid ${TOKENS.colors.borderBlue}`,
              boxShadow: `${TOKENS.shadow.md}, ${TOKENS.shadow.inset}`,
            }}>
              <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginBottom: 14 }}>PLAN DIARIO PARA FECHA OBJETIVO</p>

              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14,
              }}>
                <div style={{
                  padding: 10, borderRadius: TOKENS.radius.md,
                  background: TOKENS.colors.surfaceSoft, border: `1px solid ${TOKENS.colors.border}`,
                }}>
                  <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, fontSize: 10 }}>CEDIS</p>
                  <p style={{ ...typo.title, color: TOKENS.colors.text, margin: '2px 0 0', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {warehouseLabel}
                  </p>
                </div>
                <div style={{
                  padding: 10, borderRadius: TOKENS.radius.md,
                  background: TOKENS.colors.surfaceSoft, border: `1px solid ${TOKENS.colors.border}`,
                }}>
                  <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, fontSize: 10 }}>Fecha objetivo</p>
                  <input
                    type="date"
                    value={dateTarget}
                    min={planningDateBounds.minDate}
                    onChange={(event) => handleDateTargetChange(event.target.value)}
                    style={{
                      width: '100%',
                      marginTop: 2,
                      padding: 0,
                      background: 'transparent',
                      border: 'none',
                      color: TOKENS.colors.text,
                      fontSize: 13,
                      fontWeight: 700,
                      outline: 'none',
                      colorScheme: 'dark',
                    }}
                  />
                </div>
              </div>

              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14,
              }}>
                <div style={{
                  padding: 10, borderRadius: TOKENS.radius.md,
                  background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.22)',
                }}>
                  <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, fontSize: 10 }}>Con plan</p>
                  <p style={{ ...typo.h2, color: TOKENS.colors.success, margin: '2px 0 0', fontSize: 18 }}>{routesWithPlan}</p>
                </div>
                <div style={{
                  padding: 10, borderRadius: TOKENS.radius.md,
                  background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.22)',
                }}>
                  <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, fontSize: 10 }}>Sin plan</p>
                  <p style={{ ...typo.h2, color: TOKENS.colors.warning, margin: '2px 0 0', fontSize: 18 }}>{routesWithoutPlan}</p>
                </div>
              </div>

              <div style={{
                marginBottom: 14, padding: 12, borderRadius: TOKENS.radius.md,
                background: TOKENS.colors.surfaceSoft, border: `1px solid ${TOKENS.colors.border}`,
              }}>
                <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '0 0 8px', fontSize: 10 }}>Filtros de clientes</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                  <select
                    value={selectedPolygonId}
                    onChange={(e) => setSelectedPolygonId(e.target.value)}
                    style={{
                      minWidth: 0, padding: '10px 8px', borderRadius: TOKENS.radius.sm,
                      background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
                      color: TOKENS.colors.text, fontSize: 12, outline: 'none',
                    }}
                  >
                    <option value="">Poligono</option>
                    {polygons.map((polygon) => (
                      <option key={optionId(polygon)} value={optionId(polygon)}>{optionLabel(polygon, 'Poligono')}</option>
                    ))}
                  </select>
                  <select
                    value={selectedSubpolygonId}
                    onChange={(e) => setSelectedSubpolygonId(e.target.value)}
                    disabled={!selectedPolygonId}
                    style={{
                      minWidth: 0, padding: '10px 8px', borderRadius: TOKENS.radius.sm,
                      background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
                      color: TOKENS.colors.text, fontSize: 12, outline: 'none', opacity: selectedPolygonId ? 1 : 0.65,
                    }}
                  >
                    <option value="">Ninguno</option>
                    {subpolygons.map((subpolygon) => (
                      <option key={optionId(subpolygon)} value={optionId(subpolygon)}>{optionLabel(subpolygon, 'Subpoligono')}</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                  {planningChannels.map((channel) => {
                    const id = optionId(channel)
                    const selected = selectedChannelIds.includes(id)
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => handleChannelToggle(id)}
                        style={{
                          padding: '6px 9px', borderRadius: TOKENS.radius.pill,
                          background: selected ? `${TOKENS.colors.blue2}22` : TOKENS.colors.surface,
                          border: `1px solid ${selected ? TOKENS.colors.blue2 : TOKENS.colors.border}`,
                          color: selected ? TOKENS.colors.blue2 : TOKENS.colors.textMuted,
                          fontSize: 11, fontWeight: 700,
                        }}
                      >
                        {optionLabel(channel, 'Canal')}
                      </button>
                    )
                  })}
                  {planningChannels.length === 0 && (
                    <span style={{ ...typo.caption, color: TOKENS.colors.textLow, fontSize: 11 }}>Sin canales cargados</span>
                  )}
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                  {VISIT_DAYS.map((day) => {
                    const selected = selectedVisitDays.includes(day.id)
                    return (
                      <button
                        key={day.id}
                        type="button"
                        onClick={() => handleVisitDayToggle(day.id)}
                        style={{
                          width: 38, height: 30, borderRadius: TOKENS.radius.pill,
                          background: selected ? 'rgba(34,197,94,0.14)' : TOKENS.colors.surface,
                          border: `1px solid ${selected ? TOKENS.colors.success : TOKENS.colors.border}`,
                          color: selected ? TOKENS.colors.success : TOKENS.colors.textMuted,
                          fontSize: 11, fontWeight: 700,
                        }}
                      >
                        {day.label}
                      </button>
                    )
                  })}
                </div>

                {/* F1: Clasificación de clientes (AA/A/B/C). Vacío = todas. */}
                <div style={{ marginBottom: 10 }}>
                  <div style={{
                    display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
                    marginBottom: 4,
                  }}>
                    <span style={{ ...typo.caption, color: TOKENS.colors.textMuted, fontSize: 10, fontWeight: 600 }}>
                      Clasificacion de clientes
                    </span>
                    <span style={{
                      ...typo.caption, color: TOKENS.colors.textLow, fontSize: 10,
                    }}>
                      {getDemandClassesSummary(selectedDemandClasses)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {DEMAND_CLASSES.map((value) => {
                      const selected = selectedDemandClasses.includes(value)
                      return (
                        <button
                          key={value}
                          type="button"
                          aria-pressed={selected}
                          aria-label={`Clasificacion ${value}`}
                          onClick={() => handleDemandClassToggle(value)}
                          style={{
                            minWidth: 44, minHeight: 32, padding: '6px 10px',
                            borderRadius: TOKENS.radius.pill,
                            background: selected ? `${TOKENS.colors.blue2}22` : TOKENS.colors.surface,
                            border: `1px solid ${selected ? TOKENS.colors.blue2 : TOKENS.colors.border}`,
                            color: selected ? TOKENS.colors.blue2 : TOKENS.colors.textMuted,
                            fontSize: 12, fontWeight: 700, letterSpacing: 0.3,
                          }}
                        >
                          {value}
                        </button>
                      )
                    })}
                  </div>
                  <p style={{
                    ...typo.caption, color: TOKENS.colors.textLow,
                    margin: '4px 0 0', fontSize: 10,
                  }}>
                    Vacio = todas las clasificaciones
                  </p>
                </div>

                <select
                  value={selectedTimeWindowId}
                  onChange={(e) => setSelectedTimeWindowId(e.target.value)}
                  style={{
                    width: '100%', padding: '10px 8px', borderRadius: TOKENS.radius.sm,
                    background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
                    color: TOKENS.colors.text, fontSize: 12, outline: 'none',
                  }}
                >
                  {timeWindows.map((window) => (
                    <option key={optionId(window) || 'any'} value={optionId(window)}>{optionLabel(window, defaultTimeWindow.label)}</option>
                  ))}
                </select>
              </div>

              <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '0 0 8px', fontSize: 10 }}>Rutas del CEDIS</p>
              {routeError && (
                <div style={{
                  marginBottom: 10, padding: 10, borderRadius: TOKENS.radius.sm,
                  background: TOKENS.colors.errorSoft, border: '1px solid rgba(239,68,68,0.25)',
                }}>
                  <p style={{ ...typo.caption, color: TOKENS.colors.error, margin: 0 }}>{routeError}</p>
                </div>
              )}
              {!routeError && routes.length === 0 && (
                <div style={{
                  marginBottom: 10, padding: 12, borderRadius: TOKENS.radius.md,
                  background: TOKENS.colors.surfaceSoft, border: `1px solid ${TOKENS.colors.border}`,
                }}>
                  <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, textAlign: 'center' }}>
                    No hay rutas asignadas para el CEDIS de tu sesion.
                  </p>
                </div>
              )}
              {routes.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                  {routes.map((route) => {
                    const selected = Number(selectedRouteId) === Number(route.route_id)
                    const color = routeStateColor(route.state)
                    const isCreating = routeLoading === route.route_id
                    return (
                      <div
                        key={route.route_id}
                        style={{
                          padding: 12, borderRadius: TOKENS.radius.md,
                          background: selected ? 'rgba(43,143,224,0.10)' : TOKENS.colors.surfaceSoft,
                          border: `1px solid ${selected ? TOKENS.colors.blue2 : TOKENS.colors.border}`,
                          display: 'flex', gap: 10, alignItems: 'center',
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedRouteId(route.route_id)}
                          style={{
                            flex: 1, minWidth: 0, textAlign: 'left',
                            display: 'flex', flexDirection: 'column', gap: 3,
                          }}
                        >
                          <span style={{ ...typo.title, color: TOKENS.colors.text, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {route.route_name || `Ruta #${route.route_id}`}
                          </span>
                          <span style={{ ...typo.caption, color: TOKENS.colors.textMuted, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {route.employee_name || 'Sin empleado'}
                          </span>
                          <span style={{
                            width: 'fit-content', marginTop: 2, padding: '2px 8px', borderRadius: TOKENS.radius.pill,
                            color, background: `${color}14`, border: `1px solid ${color}30`,
                            fontSize: 10, fontWeight: 700,
                          }}>
                            {routeStateLabel(route.state)}
                          </span>
                        </button>
                        {!route.plan_id ? (
                          <button
                            type="button"
                            onClick={() => handleEnsurePlan(route)}
                            disabled={isCreating}
                            style={{
                              flexShrink: 0, padding: '8px 10px', borderRadius: TOKENS.radius.md,
                              background: isCreating ? TOKENS.colors.surface : TOKENS.colors.blue2,
                              color: '#fff', fontSize: 11, fontWeight: 700, opacity: isCreating ? 0.6 : 1,
                            }}
                          >
                            {isCreating ? 'Creando...' : 'Crear plan'}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setSelectedRouteId(route.route_id)}
                            style={{
                              flexShrink: 0, padding: '8px 10px', borderRadius: TOKENS.radius.md,
                              background: selected ? TOKENS.colors.blueGlow : TOKENS.colors.surface,
                              border: `1px solid ${selected ? TOKENS.colors.blue2 : TOKENS.colors.border}`,
                              color: selected ? TOKENS.colors.blue2 : TOKENS.colors.textMuted,
                              fontSize: 11, fontWeight: 700,
                            }}
                          >
                            {selected ? 'Editando' : 'Editar'}
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              <div style={{
                marginBottom: 12, padding: 10, borderRadius: TOKENS.radius.md,
                background: selectedRoute ? 'rgba(43,143,224,0.08)' : TOKENS.colors.surfaceSoft,
                border: `1px solid ${selectedRoute ? 'rgba(43,143,224,0.25)' : TOKENS.colors.border}`,
              }}>
                <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, fontSize: 10 }}>Forecast asociado a</p>
                <p style={{ ...typo.title, color: selectedRoute ? TOKENS.colors.text : TOKENS.colors.textMuted, margin: '2px 0 0', fontSize: 14 }}>
                  {selectedRoute ? `${selectedRoute.route_name || `Ruta #${selectedRoute.route_id}`} - ${selectedRoute.employee_name || 'Sin empleado'}` : 'Selecciona una ruta'}
                </p>
              </div>

              {lines.map((line, idx) => (
                <div key={idx} style={{
                  padding: 12, borderRadius: TOKENS.radius.md, marginBottom: 10,
                  background: TOKENS.colors.surfaceSoft, border: `1px solid ${TOKENS.colors.border}`,
                }}>
                  {/* Product selector */}
                  <button
                    type="button"
                    onClick={() => setProductLineIdx(idx)}
                    style={{
                      width: '100%', minHeight: 44, padding: '10px 12px', borderRadius: TOKENS.radius.sm,
                      background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
                      color: line.product_id ? TOKENS.colors.text : TOKENS.colors.textLow,
                      fontSize: 14, marginBottom: 8, outline: 'none',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  >
                    <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {productLabelForLine(line) || 'Seleccionar producto...'}
                    </span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M6 9l6 6 6-6"/>
                    </svg>
                  </button>

                  {/* Channel pills */}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    {CHANNELS.map(ch => (
                      <button key={ch} onClick={() => updateLine(idx, 'channel', ch)} style={{
                        flex: 1, padding: '8px 0', borderRadius: TOKENS.radius.pill, fontSize: 13, fontWeight: 600,
                        background: line.channel === ch ? `${TOKENS.colors.blue2}22` : TOKENS.colors.surface,
                        border: `1px solid ${line.channel === ch ? TOKENS.colors.blue2 : TOKENS.colors.border}`,
                        color: line.channel === ch ? TOKENS.colors.blue2 : TOKENS.colors.textMuted,
                      }}>{ch}</button>
                    ))}
                  </div>

                  {/* Qty + remove */}
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      type="number"
                      inputMode="numeric"
                      placeholder="Cantidad"
                      value={line.qty}
                      onChange={e => updateLine(idx, 'qty', e.target.value)}
                      style={{
                        flex: 1, padding: '10px 12px', borderRadius: TOKENS.radius.sm,
                        background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
                        color: TOKENS.colors.text, fontSize: 14, outline: 'none',
                      }}
                    />
                    {lines.length > 1 && (
                      <button onClick={() => removeLine(idx)} style={{
                        width: 36, height: 36, borderRadius: TOKENS.radius.sm,
                        background: TOKENS.colors.errorSoft, border: `1px solid rgba(239,68,68,0.25)`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={TOKENS.colors.error} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {/* Add product */}
              <button onClick={addLine} style={{
                width: '100%', padding: '10px 0', borderRadius: TOKENS.radius.md, marginBottom: 12,
                background: TOKENS.colors.surface, border: `1px dashed ${TOKENS.colors.border}`,
                color: TOKENS.colors.textMuted, fontSize: 13, fontWeight: 600,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Agregar producto
              </button>

              {/* Submit */}
              <button onClick={handleSubmit} disabled={submitting} style={{
                width: '100%', padding: '12px 0', borderRadius: TOKENS.radius.md,
                background: TOKENS.colors.blue2, color: '#fff', fontSize: 14, fontWeight: 700,
                opacity: submitting ? 0.6 : 1,
              }}>
                {submitting ? 'Guardando...' : 'Guardar Pronostico'}
              </button>

              {msg && (
                <p style={{
                  ...typo.caption, textAlign: 'center', marginTop: 10,
                  color: msg.includes('guardado') || msg.includes('listo') || msg.includes('confirmado') ? TOKENS.colors.success : TOKENS.colors.error,
                }}>{msg}</p>
              )}
            </div>
            </>
            )}
            {/* F4-E.2: fin del conditional planMode === 'manual' */}

            {/* Recent forecasts */}
            {forecasts.length > 0 && (
              <>
                <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginTop: 24, marginBottom: 12 }}>PRONOSTICOS RECIENTES</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {forecasts.map((f, i) => {
                    const vendorName = f.created_by_employee_id?.[1] || ''
                    const st = f.state || f.status || 'draft'
                    const isActing = actionLoading === f.id
                    const isExpanded = expandedForecastId === f.id
                    const isLinesLoading = forecastLinesLoading === f.id
                    const cachedLines = forecastLinesCache[f.id] || null
                    const isEditing = editingForecastId === f.id
                    return (
                    <div key={f.id || i} style={{
                      borderRadius: TOKENS.radius.lg,
                      background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
                      overflow: 'hidden',
                    }}>
                      {/* Header row */}
                      <div style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <button
                            onClick={() => handleToggleExpand(f.id)}
                            style={{
                              flex: 1, textAlign: 'left', background: 'none', border: 'none', padding: 0,
                              display: 'flex', alignItems: 'center', gap: 8,
                            }}
                          >
                            <div>
                              <p style={{ ...typo.title, color: TOKENS.colors.text, margin: 0, fontSize: 14 }}>{f.date_target || f.date}</p>
                              <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, marginTop: 2 }}>
                                {f.line_count || f.lines?.length || 0} productos
                                {vendorName ? ` — ${vendorName}` : ' — Sucursal'}
                              </p>
                            </div>
                            <svg
                              width="16" height="16" viewBox="0 0 24 24" fill="none"
                              stroke={TOKENS.colors.textMuted} strokeWidth="2"
                              strokeLinecap="round" strokeLinejoin="round"
                              style={{ flexShrink: 0, transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
                            >
                              <polyline points="6 9 12 15 18 9"/>
                            </svg>
                          </button>
                          <div style={{
                            marginLeft: 8, padding: '4px 10px', borderRadius: TOKENS.radius.pill,
                            background: `${statusColor(st)}14`,
                            border: `1px solid ${statusColor(st)}30`,
                            flexShrink: 0,
                          }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: statusColor(st) }}>{statusLabel(st)}</span>
                          </div>
                        </div>

                        {/* Action buttons */}
                        {!isEditing && (st === 'draft' || st === 'confirmed') && (
                          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                            {st === 'draft' && (
                              <>
                                <button onClick={() => handleConfirm(f.id)} disabled={isActing} style={{
                                  flex: 1, padding: '8px 0', borderRadius: TOKENS.radius.md,
                                  background: isActing ? TOKENS.colors.surface : 'rgba(34,197,94,0.12)',
                                  border: '1px solid rgba(34,197,94,0.3)', color: '#22c55e',
                                  fontSize: 12, fontWeight: 700, opacity: isActing ? 0.5 : 1,
                                }}>
                                  {isActing ? '...' : 'Confirmar'}
                                </button>
                                <button
                                  onClick={() => { if (!isExpanded) handleToggleExpand(f.id); handleStartEdit(f) }}
                                  disabled={isActing}
                                  style={{
                                    padding: '8px 12px', borderRadius: TOKENS.radius.md,
                                    background: isActing ? TOKENS.colors.surface : 'rgba(99,179,237,0.12)',
                                    border: `1px solid ${TOKENS.colors.blue2}40`, color: TOKENS.colors.blue3,
                                    fontSize: 12, fontWeight: 700, opacity: isActing ? 0.5 : 1, flexShrink: 0,
                                  }}
                                >
                                  Editar
                                </button>
                                <button onClick={() => handleDelete(f.id)} disabled={isActing} style={{
                                  width: 36, height: 34, borderRadius: TOKENS.radius.md, flexShrink: 0,
                                  background: isActing ? TOKENS.colors.surface : 'rgba(239,68,68,0.08)',
                                  border: '1px solid rgba(239,68,68,0.25)',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  opacity: isActing ? 0.5 : 1,
                                }}>
                                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                                  </svg>
                                </button>
                              </>
                            )}
                            {st === 'confirmed' && (
                              <button onClick={() => handleCancel(f.id)} disabled={isActing} style={{
                                flex: 1, padding: '8px 0', borderRadius: TOKENS.radius.md,
                                background: isActing ? TOKENS.colors.surface : 'rgba(239,68,68,0.08)',
                                border: '1px solid rgba(239,68,68,0.25)', color: '#ef4444',
                                fontSize: 12, fontWeight: 700, opacity: isActing ? 0.5 : 1,
                              }}>
                                {isActing ? '...' : 'Regresar a borrador'}
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Expanded: line breakdown / edit */}
                      {isExpanded && (
                        <div style={{ borderTop: `1px solid ${TOKENS.colors.border}`, padding: '12px 16px' }}>
                          {isLinesLoading ? (
                            <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, textAlign: 'center' }}>Cargando líneas…</p>
                          ) : isEditing ? (
                            /* ── Edit mode ── */
                            <>
                              {editLines.map((el, idx) => (
                                <div key={idx} style={{ marginBottom: 10 }}>
                                  {/* Product selector */}
                                  <button
                                    onClick={() => setEditProductLineIdx(idx)}
                                    style={{
                                      width: '100%', padding: '9px 12px', borderRadius: TOKENS.radius.md,
                                      background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
                                      color: el.product_id ? TOKENS.colors.text : TOKENS.colors.textMuted,
                                      fontSize: 13, textAlign: 'left', marginBottom: 6,
                                    }}
                                  >
                                    {el.product_id
                                      ? (productNameForId(el.product_id) || `Producto #${el.product_id}`)
                                      : 'Seleccionar producto'}
                                  </button>
                                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                    {/* Channel pills */}
                                    {CHANNELS.map(ch => (
                                      <button
                                        key={ch}
                                        onClick={() => updateEditLine(idx, 'channel', ch)}
                                        style={{
                                          padding: '6px 10px', borderRadius: TOKENS.radius.pill,
                                          fontSize: 12, fontWeight: 600,
                                          background: el.channel === ch ? TOKENS.colors.blue2 : TOKENS.colors.surface,
                                          border: `1px solid ${el.channel === ch ? TOKENS.colors.blue2 : TOKENS.colors.border}`,
                                          color: el.channel === ch ? '#fff' : TOKENS.colors.textMuted,
                                        }}
                                      >{ch}</button>
                                    ))}
                                    {/* Qty */}
                                    <input
                                      type="number" inputMode="decimal" min="0"
                                      value={el.qty}
                                      onChange={e => updateEditLine(idx, 'qty', e.target.value)}
                                      placeholder="Qty"
                                      style={{
                                        flex: 1, padding: '6px 10px', borderRadius: TOKENS.radius.md,
                                        background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
                                        color: TOKENS.colors.text, fontSize: 13, textAlign: 'right',
                                      }}
                                    />
                                    {/* Remove */}
                                    <button onClick={() => removeEditLine(idx)} style={{
                                      width: 32, height: 32, borderRadius: TOKENS.radius.sm,
                                      background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                    }}>
                                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                                      </svg>
                                    </button>
                                  </div>
                                </div>
                              ))}
                              {/* Add line */}
                              <button onClick={addEditLine} style={{
                                width: '100%', padding: '8px 0', borderRadius: TOKENS.radius.md, marginBottom: 10,
                                background: TOKENS.colors.surface, border: `1px dashed ${TOKENS.colors.border}`,
                                color: TOKENS.colors.textMuted, fontSize: 12, fontWeight: 600,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                              }}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                                Agregar producto
                              </button>
                              {/* Save / Cancel */}
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button onClick={() => handleSaveEdit(f.id)} disabled={editSubmitting} style={{
                                  flex: 1, padding: '9px 0', borderRadius: TOKENS.radius.md,
                                  background: TOKENS.colors.blue2, color: '#fff', fontSize: 13, fontWeight: 700,
                                  opacity: editSubmitting ? 0.6 : 1,
                                }}>
                                  {editSubmitting ? 'Guardando…' : 'Guardar cambios'}
                                </button>
                                <button onClick={handleCancelEdit} disabled={editSubmitting} style={{
                                  padding: '9px 14px', borderRadius: TOKENS.radius.md,
                                  background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
                                  color: TOKENS.colors.textMuted, fontSize: 13, fontWeight: 600,
                                }}>
                                  Cancelar
                                </button>
                              </div>
                            </>
                          ) : (
                            /* ── Read-only line list ── */
                            cachedLines && cachedLines.length > 0 ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {cachedLines.map((l, li) => (
                                  <div key={l.id || li} style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    padding: '7px 10px', borderRadius: TOKENS.radius.md,
                                    background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
                                  }}>
                                    <span style={{ fontSize: 13, color: TOKENS.colors.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {productNameForId(l.product_id) || l.product_name || `#${l.product_id}`}
                                    </span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                                      <span style={{
                                        fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: TOKENS.radius.pill,
                                        background: l.channel === 'counter' ? 'rgba(168,85,247,0.12)' : 'rgba(59,130,246,0.12)',
                                        color: l.channel === 'counter' ? '#a855f7' : '#3b82f6',
                                        border: l.channel === 'counter' ? '1px solid rgba(168,85,247,0.25)' : '1px solid rgba(59,130,246,0.25)',
                                        textTransform: 'uppercase',
                                      }}>
                                        {l.channel === 'counter' ? 'Mostrador' : 'Van'}
                                      </span>
                                      <span style={{ fontSize: 13, fontWeight: 700, color: TOKENS.colors.text, minWidth: 32, textAlign: 'right' }}>
                                        {l.qty}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, textAlign: 'center' }}>Sin líneas registradas</p>
                            )
                          )}
                        </div>
                      )}
                    </div>
                  )})}
                </div>
              </>
            )}
            <div style={{ height: 32 }} />
          </>
        )}
      </div>

      {/* Product sheet — new forecast */}
      <SearchableSheet
        open={productLineIdx !== null}
        onClose={() => setProductLineIdx(null)}
        title="Seleccionar producto"
        placeholder="Buscar producto..."
        options={productOptions}
        selectedId={productLineIdx !== null ? lines[productLineIdx]?.product_id || '' : ''}
        onSelect={(opt) => {
          if (productLineIdx !== null) updateLine(productLineIdx, 'product_id', opt.id)
        }}
        emptyText="No se encontraron productos"
      />

      {/* Product sheet — edit forecast */}
      <SearchableSheet
        open={editProductLineIdx !== null}
        onClose={() => setEditProductLineIdx(null)}
        title="Seleccionar producto"
        placeholder="Buscar producto..."
        options={productOptions}
        selectedId={editProductLineIdx !== null ? editLines[editProductLineIdx]?.product_id || '' : ''}
        onSelect={(opt) => {
          if (editProductLineIdx !== null) updateEditLine(editProductLineIdx, 'product_id', opt.id)
        }}
        emptyText="No se encontraron productos"
      />
    </div>
  )
}
