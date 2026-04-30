import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../App'
import { TOKENS, getTypo } from '../../tokens'
import { getForecastProducts, createForecast, getForecasts, getTeam, confirmForecast, cancelForecast, deleteForecast } from './api'
import { logScreenError } from '../shared/logScreenError'

const CHANNELS = ['Van', 'Mostrador']

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
  const [team, setTeam] = useState([])
  const [lines, setLines] = useState([{ product_id: '', channel: 'Van', qty: '' }])
  const [selectedVendor, setSelectedVendor] = useState('') // '' = global sucursal
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [msg, setMsg] = useState(null)

  // Sheet state — un solo sheet a la vez. `productLineIdx` indica qué línea
  // se está editando; null cuando el sheet abierto es el de vendedor.
  const [vendorSheetOpen, setVendorSheetOpen] = useState(false)
  const [productLineIdx, setProductLineIdx] = useState(null)

  // Opciones formateadas para el sheet ({ id, label }).
  // El vendedor incluye una opción especial id=''  para "Sucursal completa".
  const vendorOptions = useMemo(() => ([
    { id: '', label: 'Sucursal completa (global)' },
    ...team.map(v => ({ id: String(v.id), label: v.name })),
  ]), [team])

  const productOptions = useMemo(
    () => products.map(p => ({ id: String(p.id), label: p.name || p.display_name || `#${p.id}` })),
    [products],
  )

  const selectedVendorLabel = useMemo(() => {
    if (!selectedVendor) return 'Sucursal completa (global)'
    const v = team.find(x => String(x.id) === String(selectedVendor))
    return v?.name || `Vendedor #${selectedVendor}`
  }, [selectedVendor, team])

  function productLabelForLine(line) {
    if (!line.product_id) return null
    const p = products.find(x => String(x.id) === String(line.product_id))
    return p?.name || p?.display_name || `Producto #${line.product_id}`
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

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [p, f, t] = await Promise.all([
        getForecastProducts().catch((e) => { logScreenError('ScreenPronostico', 'getForecastProducts', e); return [] }),
        getForecasts().catch((e) => { logScreenError('ScreenPronostico', 'getForecasts', e); return [] }),
        getTeam().catch((e) => { logScreenError('ScreenPronostico', 'getTeam', e); return [] }),
      ])
      setProducts(p || [])
      setForecasts(f || [])
      setTeam(t || [])
    } catch (e) { logScreenError('ScreenPronostico', 'loadData', e) }
    finally { setLoading(false) }
  }

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

  async function handleSubmit() {
    const validLines = lines.filter(l => l.product_id && l.qty > 0)
    if (validLines.length === 0) { setMsg('Agrega al menos un producto'); return }

    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const dateTarget = tomorrow.toISOString().split('T')[0]

    setSubmitting(true)
    setMsg(null)
    try {
      const forecastData = {
        date_target: dateTarget,
        lines: validLines.map(l => ({ product_id: Number(l.product_id), channel: l.channel, qty: Number(l.qty) })),
        sucursal: session?.sucursal_id || session?.sucursal,
      }
      // Per-vendor forecast: si se seleccionó un vendedor, incluir employee_id
      if (selectedVendor) forecastData.employee_id = Number(selectedVendor)
      await createForecast(forecastData)
      setMsg('Pronostico guardado')
      setLines([{ product_id: '', channel: 'Van', qty: '' }])
      const f = await getForecasts().catch(() => [])
      setForecasts(f || [])
    } catch (e) {
      setMsg(e.message || 'Error al guardar')
    } finally { setSubmitting(false) }
  }

  const [actionLoading, setActionLoading] = useState(null) // forecast id being acted on

  async function handleConfirm(forecastId) {
    setActionLoading(forecastId)
    try {
      await confirmForecast(forecastId)
      const f = await getForecasts().catch(() => [])
      setForecasts(f || [])
      flashMsg('Pronostico confirmado')
    } catch (e) {
      flashMsg(e.message || 'Error al confirmar', 5000)
    } finally { setActionLoading(null) }
  }

  async function handleCancel(forecastId) {
    setActionLoading(forecastId)
    try {
      await cancelForecast(forecastId)
      const f = await getForecasts().catch(() => [])
      setForecasts(f || [])
      flashMsg('Pronostico regresado a borrador')
    } catch (e) {
      flashMsg(e.message || 'Error al cancelar', 5000)
    } finally { setActionLoading(null) }
  }

  async function handleDelete(forecastId) {
    setActionLoading(forecastId)
    try {
      await deleteForecast(forecastId)
      const f = await getForecasts().catch(() => [])
      setForecasts(f || [])
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
            {/* Form */}
            <div style={{
              marginTop: 8, padding: 16, borderRadius: TOKENS.radius.xl,
              background: TOKENS.glass.hero, border: `1px solid ${TOKENS.colors.borderBlue}`,
              boxShadow: `${TOKENS.shadow.md}, ${TOKENS.shadow.inset}`,
            }}>
              <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginBottom: 14 }}>PRONOSTICO PARA MANANA</p>

              {/* Vendor selector — per-vendor or global */}
              <div style={{ marginBottom: 12 }}>
                <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '0 0 4px', fontSize: 10 }}>Alcance del pronostico</p>
                <button
                  type="button"
                  onClick={() => setVendorSheetOpen(true)}
                  style={{
                    width: '100%', minHeight: 44, padding: '10px 12px', borderRadius: TOKENS.radius.sm,
                    background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
                    color: TOKENS.colors.text, fontSize: 14, outline: 'none',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                >
                  <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {selectedVendorLabel}
                  </span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M6 9l6 6 6-6"/>
                  </svg>
                </button>
                {selectedVendor && (
                  <p style={{ ...typo.caption, color: TOKENS.colors.blue2, margin: '4px 0 0', fontSize: 10 }}>
                    Pronostico individual para {selectedVendorLabel}
                  </p>
                )}
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
                  color: msg.includes('guardado') ? TOKENS.colors.success : TOKENS.colors.error,
                }}>{msg}</p>
              )}
            </div>

            {/* Recent forecasts */}
            {forecasts.length > 0 && (
              <>
                <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginTop: 24, marginBottom: 12 }}>PRONOSTICOS RECIENTES</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {forecasts.map((f, i) => {
                    const vendorName = f.created_by_employee_id?.[1] || ''
                    const st = f.state || f.status || 'draft'
                    const isActing = actionLoading === f.id
                    return (
                    <div key={f.id || i} style={{
                      padding: '12px 16px', borderRadius: TOKENS.radius.lg,
                      background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <p style={{ ...typo.title, color: TOKENS.colors.text, margin: 0, fontSize: 14 }}>{f.date_target || f.date}</p>
                          <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, marginTop: 2 }}>
                            {f.line_count || f.lines?.length || 0} productos
                            {vendorName ? ` — ${vendorName}` : ' — Sucursal'}
                          </p>
                        </div>
                        <div style={{
                          padding: '4px 10px', borderRadius: TOKENS.radius.pill,
                          background: `${statusColor(st)}14`,
                          border: `1px solid ${statusColor(st)}30`,
                        }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: statusColor(st) }}>{statusLabel(st)}</span>
                        </div>
                      </div>
                      {/* Action buttons — only for draft or confirmed */}
                      {(st === 'draft' || st === 'confirmed') && (
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
                  )})}
                </div>
              </>
            )}
            <div style={{ height: 32 }} />
          </>
        )}
      </div>

      {/* Vendor sheet */}
      <SearchableSheet
        open={vendorSheetOpen}
        onClose={() => setVendorSheetOpen(false)}
        title="Alcance del pronostico"
        placeholder="Buscar vendedor..."
        options={vendorOptions}
        selectedId={selectedVendor || ''}
        onSelect={(opt) => setSelectedVendor(opt.id)}
        emptyText="No se encontraron vendedores"
      />

      {/* Product sheet (per-line) */}
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
    </div>
  )
}
