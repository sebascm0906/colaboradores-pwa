// ─── AnalyticAccountPicker — selector real de cuenta analítica ──────────────
// Fetch vía GET /pwa-admin/analytic-accounts?company_id={id} (gf_pwa_admin).
// Soporta dos modos:
//   - distribución única 100% en una cuenta (caso 95% de gastos simples)
//   - valor: número (account_id)  → se guarda { [id]: 100 }
//
// Props:
//   value:     null | number | { [id]: pct }
//   onChange:  (next) => void — devuelve dict analytic_distribution o null
//   companyId: razón social activa (requerido — refetch al cambiar)
//   label, required
import { useEffect, useMemo, useRef, useState } from 'react'
import { TOKENS } from '../../../tokens'
import { BACKEND_CAPS } from '../adminService'
import { getAnalyticAccounts } from '../api'

function normalizeValue(value) {
  if (value == null) return null
  if (typeof value === 'number') return { [String(value)]: 100.0 }
  if (typeof value === 'object') return value
  return null
}

function primaryAccountId(dist) {
  if (!dist) return null
  const keys = Object.keys(dist)
  if (!keys.length) return null
  // Caso simple: un solo account con cualquier porcentaje
  return Number(keys[0])
}

export default function AnalyticAccountPicker({
  value = null,
  onChange,
  companyId,
  label = 'Cuenta analítica',
  required = false,
}) {
  const enabled = BACKEND_CAPS.expenseAnalytics

  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef(null)

  const normalized = useMemo(() => normalizeValue(value), [value])
  const selectedId = useMemo(() => primaryAccountId(normalized), [normalized])
  const selectedAccount = useMemo(
    () => accounts.find(a => a.id === selectedId) || null,
    [accounts, selectedId],
  )

  // Fetch al montar / cuando cambia la razón social
  useEffect(() => {
    if (!enabled || !companyId) {
      setAccounts([])
      return
    }
    let alive = true
    setLoading(true)
    setError('')
    getAnalyticAccounts(companyId)
      .then(res => {
        if (!alive) return
        const data = res?.data || res
        const list = Array.isArray(data?.accounts) ? data.accounts : []
        setAccounts(list)
      })
      .catch(e => {
        if (!alive) return
        setError(e?.message || 'No se pudieron cargar las cuentas')
        setAccounts([])
      })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [companyId, enabled])

  // Si la cuenta seleccionada ya no pertenece a la company activa → limpiar
  useEffect(() => {
    if (!selectedId || !accounts.length) return
    if (!accounts.some(a => a.id === selectedId)) {
      onChange?.(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts, selectedId])

  // Click-outside para cerrar el dropdown
  useEffect(() => {
    if (!open) return
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const filtered = useMemo(() => {
    if (!search.trim()) return accounts
    const q = search.trim().toLowerCase()
    return accounts.filter(a =>
      (a.name || '').toLowerCase().includes(q) ||
      (a.code || '').toLowerCase().includes(q),
    )
  }, [accounts, search])

  function handleSelect(account) {
    onChange?.({ [String(account.id)]: 100.0 })
    setOpen(false)
    setSearch('')
  }

  function handleClear(e) {
    e.stopPropagation()
    onChange?.(null)
  }

  // Modo pendiente — fallback de seguridad si el flag está en false
  if (!enabled) {
    return (
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 12, color: TOKENS.colors.textMuted, fontWeight: 500, display: 'block', marginBottom: 4 }}>
          {label} {required && <span style={{ color: TOKENS.colors.blue3 }}>*</span>}
        </label>
        <div style={{
          padding: '10px 14px', borderRadius: TOKENS.radius.md,
          background: TOKENS.colors.surfaceSoft,
          border: `1px dashed ${TOKENS.colors.border}`,
          color: TOKENS.colors.textLow, fontSize: 13,
        }}>
          Analítica deshabilitada (módulo gf_pwa_admin no disponible).
        </div>
      </div>
    )
  }

  return (
    <div ref={ref} style={{ marginBottom: 12, position: 'relative' }}>
      <label style={{
        fontSize: 12, color: TOKENS.colors.textMuted, fontWeight: 500,
        display: 'block', marginBottom: 4,
      }}>
        {label} {required && <span style={{ color: TOKENS.colors.blue3 }}>*</span>}
      </label>

      <button
        type="button"
        onClick={() => !loading && setOpen(o => !o)}
        style={{
          width: '100%', padding: '10px 14px', borderRadius: TOKENS.radius.md,
          background: TOKENS.colors.surface,
          border: `1px solid ${selectedAccount ? TOKENS.colors.blue2 : TOKENS.colors.border}`,
          color: selectedAccount ? TOKENS.colors.text : TOKENS.colors.textLow,
          fontSize: 13, fontFamily: "'DM Sans', sans-serif",
          display: 'flex', alignItems: 'center', gap: 10,
          textAlign: 'left', cursor: loading ? 'wait' : 'pointer',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <path d="M3 3h18v18H3z"/>
          <path d="M3 9h18"/>
          <path d="M9 21V9"/>
        </svg>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {loading
            ? 'Cargando cuentas…'
            : selectedAccount
              ? `${selectedAccount.code ? selectedAccount.code + ' · ' : ''}${selectedAccount.name}`
              : 'Seleccionar cuenta analítica…'}
        </span>
        {selectedAccount && !loading && (
          <span
            onClick={handleClear}
            style={{
              fontSize: 11, color: TOKENS.colors.textMuted, padding: '2px 6px',
              borderRadius: 4, border: `1px solid ${TOKENS.colors.border}`,
            }}
          >
            Quitar
          </span>
        )}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9l6 6 6-6"/>
        </svg>
      </button>

      {error && (
        <p style={{ fontSize: 10, color: TOKENS.colors.error, margin: '4px 0 0' }}>
          {error}
        </p>
      )}

      {open && !loading && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
          background: TOKENS.colors.bg1, border: `1px solid ${TOKENS.colors.border}`,
          borderRadius: TOKENS.radius.md,
          boxShadow: TOKENS.shadow?.lg || '0 12px 32px rgba(0,0,0,0.45)',
          zIndex: 50, maxHeight: 280, overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ padding: 8, borderBottom: `1px solid ${TOKENS.colors.border}` }}>
            <input
              autoFocus
              type="text"
              placeholder="Buscar por nombre o código…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: '100%', padding: '8px 10px', borderRadius: TOKENS.radius.sm,
                background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
                color: TOKENS.colors.text, fontSize: 12, outline: 'none',
                fontFamily: "'DM Sans', sans-serif",
              }}
            />
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {filtered.length === 0 ? (
              <div style={{ padding: 14, fontSize: 12, color: TOKENS.colors.textLow, textAlign: 'center' }}>
                {accounts.length === 0
                  ? 'No hay cuentas analíticas para esta razón social'
                  : 'Sin coincidencias'}
              </div>
            ) : (
              filtered.map(a => {
                const active = a.id === selectedId
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => handleSelect(a)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      width: '100%', padding: '10px 12px', border: 'none',
                      background: active ? TOKENS.colors.blueGlow : 'transparent',
                      color: TOKENS.colors.text, fontSize: 12, textAlign: 'left',
                      cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
                      borderBottom: `1px solid ${TOKENS.colors.border}30`,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontWeight: 600, color: TOKENS.colors.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {a.name}
                      </p>
                      <p style={{ margin: 0, fontSize: 10, color: TOKENS.colors.textLow }}>
                        {a.code ? `${a.code} · ` : ''}{a.plan_name || 'Plan analítico'}
                      </p>
                    </div>
                    {active && (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={TOKENS.colors.blue3} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    )}
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
