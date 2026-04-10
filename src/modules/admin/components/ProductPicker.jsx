// ─── ProductPicker — combobox de productos para líneas de requisición/POS ──
// Dos modos según BACKEND_CAPS.productSearch:
//   · true  → búsqueda server-side vía searchProducts() con debounce
//   · false → fallback legacy: getPosProducts(warehouseId) cached + filter client
// En ambos casos devuelve { id, name } al seleccionar.
//
// Props:
//   value:        null | { id, name }  — producto seleccionado
//   onChange:     (product | null) => void
//   warehouseId:  id del almacén (usado en modo legacy; informativo en server-side)
//   scope:        'purchase' | 'sale' | 'all' (solo server-side). Default 'purchase'.
//   placeholder:  texto del placeholder
//   disabled
import { useEffect, useMemo, useRef, useState } from 'react'
import { TOKENS } from '../../../tokens'
import { getPosProducts, searchProducts } from '../api'
import { BACKEND_CAPS } from '../adminService'

// Cache por warehouse para modo legacy — una vez por sesión
const legacyCache = new Map()

async function fetchLegacyProducts(warehouseId) {
  if (legacyCache.has(warehouseId)) return legacyCache.get(warehouseId)
  const p = getPosProducts(warehouseId)
    .then(res => {
      const data = res?.data || res
      const list = Array.isArray(data) ? data : (Array.isArray(data?.products) ? data.products : [])
      return list
    })
    .catch(() => [])
  legacyCache.set(warehouseId, p)
  return p
}

/** Limpia el cache — útil cuando el usuario quiere forzar refresh */
export function invalidateProductCache(warehouseId) {
  if (warehouseId == null) legacyCache.clear()
  else legacyCache.delete(warehouseId)
}

export default function ProductPicker({
  value = null,
  onChange,
  warehouseId,
  scope = 'purchase',
  placeholder = 'Buscar producto…',
  disabled = false,
}) {
  const serverMode = BACKEND_CAPS.productSearch === true

  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef(null)

  // Modo legacy — fetch único del catálogo por warehouse
  useEffect(() => {
    if (serverMode) return
    if (!warehouseId) return
    let alive = true
    setLoading(true)
    fetchLegacyProducts(warehouseId)
      .then(list => { if (alive) setProducts(list) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [warehouseId, serverMode])

  // Modo server-side — debounced search cada vez que cambia el query
  useEffect(() => {
    if (!serverMode) return
    if (!open) return
    const q = search.trim()
    // Si el query está vacío, pedimos los primeros 50 igual para mostrar algo
    let alive = true
    setLoading(true)
    const timer = setTimeout(() => {
      searchProducts({ q: q || undefined, scope, limit: 50 })
        .then(res => {
          if (!alive) return
          const data = res?.data ?? res
          const list = Array.isArray(data)
            ? data
            : (Array.isArray(data?.products) ? data.products : [])
          setProducts(list)
        })
        .catch(() => { if (alive) setProducts([]) })
        .finally(() => { if (alive) setLoading(false) })
    }, q ? 300 : 0)
    return () => { alive = false; clearTimeout(timer) }
  }, [search, open, serverMode, scope])

  useEffect(() => {
    if (!open) return
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const filtered = useMemo(() => {
    // En server-side la lista YA viene filtrada por el backend
    if (serverMode) return products.slice(0, 50)
    // Modo legacy: filtro client-side sobre el catálogo cacheado
    if (!search.trim()) return products.slice(0, 50)
    const q = search.trim().toLowerCase()
    return products.filter(p =>
      (p.name || '').toLowerCase().includes(q) ||
      (p.default_code || p.sku || '').toLowerCase().includes(q),
    ).slice(0, 50)
  }, [products, search, serverMode])

  const inputStyle = {
    width: '100%', padding: '9px 12px', borderRadius: TOKENS.radius.md,
    background: TOKENS.colors.surface,
    border: `1px solid ${value ? TOKENS.colors.blue2 : TOKENS.colors.border}`,
    color: value ? TOKENS.colors.text : TOKENS.colors.textLow,
    fontSize: 13, outline: 'none', fontFamily: "'DM Sans', sans-serif",
    textAlign: 'left', cursor: disabled ? 'not-allowed' : 'pointer',
    display: 'flex', alignItems: 'center', gap: 8,
  }

  // En modo legacy, `loading` bloquea el botón mientras se descarga el catálogo.
  // En modo server-side, `loading` sólo debe afectar el dropdown interno.
  const buttonLoading = !serverMode && loading

  return (
    <div ref={ref} style={{ position: 'relative', flex: 1, minWidth: 0 }}>
      <button
        type="button"
        disabled={disabled || buttonLoading}
        onClick={() => !disabled && !buttonLoading && setOpen(o => !o)}
        style={inputStyle}
      >
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {buttonLoading
            ? 'Cargando productos…'
            : value
              ? value.name
              : placeholder}
        </span>
        {value && !disabled && (
          <span
            onClick={(e) => { e.stopPropagation(); onChange?.(null) }}
            style={{
              fontSize: 11, color: TOKENS.colors.textMuted, padding: '2px 6px',
              borderRadius: 4, border: `1px solid ${TOKENS.colors.border}`,
            }}
          >
            ×
          </span>
        )}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9l6 6 6-6"/>
        </svg>
      </button>

      {open && !buttonLoading && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
          background: TOKENS.colors.bg1, border: `1px solid ${TOKENS.colors.border}`,
          borderRadius: TOKENS.radius.md, boxShadow: TOKENS.shadow?.lg || '0 12px 32px rgba(0,0,0,0.45)',
          zIndex: 100, maxHeight: 260, overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ padding: 6, borderBottom: `1px solid ${TOKENS.colors.border}`, position: 'relative' }}>
            <input
              autoFocus
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={serverMode ? 'Buscar por nombre, SKU o código…' : 'Buscar por nombre o SKU…'}
              style={{
                width: '100%', padding: '7px 10px', paddingRight: serverMode && loading ? 28 : 10,
                borderRadius: TOKENS.radius.sm,
                background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
                color: TOKENS.colors.text, fontSize: 12, outline: 'none',
                fontFamily: "'DM Sans', sans-serif",
              }}
            />
            {serverMode && loading && (
              <div style={{
                position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                width: 12, height: 12, border: '2px solid rgba(255,255,255,0.12)',
                borderTop: '2px solid #2B8FE0', borderRadius: '50%',
                animation: 'spin 0.8s linear infinite', pointerEvents: 'none',
              }} />
            )}
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {loading && serverMode && products.length === 0 ? (
              <div style={{ padding: 14, fontSize: 12, color: TOKENS.colors.textLow, textAlign: 'center' }}>
                Buscando…
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: 14, fontSize: 12, color: TOKENS.colors.textLow, textAlign: 'center' }}>
                {serverMode
                  ? (search.trim() ? 'Sin coincidencias' : 'Escribe para buscar')
                  : (products.length === 0 ? 'Sin productos' : 'Sin coincidencias')}
              </div>
            ) : (
              filtered.map(p => {
                const active = value?.id === p.id
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => { onChange?.({ id: p.id, name: p.name }); setOpen(false); setSearch('') }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      width: '100%', padding: '8px 12px', border: 'none',
                      background: active ? TOKENS.colors.blueGlow : 'transparent',
                      color: TOKENS.colors.text, fontSize: 12, textAlign: 'left',
                      cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
                      borderBottom: `1px solid ${TOKENS.colors.border}30`,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontWeight: 600, color: TOKENS.colors.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.name}
                      </p>
                      {(p.default_code || p.sku || p.barcode) && (
                        <p style={{ margin: 0, fontSize: 10, color: TOKENS.colors.textLow }}>
                          {[p.default_code || p.sku, p.categ_name, p.uom]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      )}
                    </div>
                    {p.qty_available != null ? (
                      <span style={{ fontSize: 10, color: TOKENS.colors.textMuted, whiteSpace: 'nowrap' }}>
                        Stock: {Number(p.qty_available).toFixed(0)}
                      </span>
                    ) : p.list_price != null ? (
                      <span style={{ fontSize: 10, color: TOKENS.colors.textMuted, whiteSpace: 'nowrap' }}>
                        ${Number(p.list_price).toFixed(2)}
                      </span>
                    ) : null}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
