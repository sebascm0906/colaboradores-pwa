import { useCallback, useEffect, useMemo, useState } from 'react'
import { TOKENS, getTypo } from '../../tokens'
import { ScreenShell, EmptyState } from '../entregas/components'
import { logScreenError } from '../shared/logScreenError'
import { getSupervisorCustomers, updateSupervisorCustomer } from './api'
import {
  buildCustomerEditorDraft,
  buildSupervisorCustomerUpdatePayload,
  getCustomerEditorValidationError,
  hasCustomerEditorChanges,
  normalizeSupervisorCustomer,
} from './customerEditorState'

function unwrapCustomers(payload) {
  if (Array.isArray(payload?.data?.customers)) return payload.data.customers
  if (Array.isArray(payload?.customers)) return payload.customers
  if (Array.isArray(payload?.data)) return payload.data
  if (Array.isArray(payload)) return payload
  return []
}

function buildCustomerErrorMessage(error) {
  const code = error?.code || error?.data?.code
  const messages = {
    customer_not_found: 'El cliente ya no esta disponible en tu sucursal.',
    name_required: 'El nombre del cliente es obligatorio.',
    latitude_invalid: 'La latitud debe ser numerica.',
    longitude_invalid: 'La longitud debe ser numerica.',
  }
  return messages[code] || error?.message || 'No se pudo procesar la informacion del cliente.'
}

function replaceCustomerInList(customers, updatedCustomer) {
  return customers.map((customer) => (
    Number(customer.id || 0) === Number(updatedCustomer.id || 0)
      ? updatedCustomer
      : customer
  ))
}

export default function ScreenClientesSupervisor() {
  const [sw, setSw] = useState(typeof window !== 'undefined' ? window.innerWidth : 1280)
  const typo = useMemo(() => getTypo(sw), [sw])

  const [query, setQuery] = useState('')
  const [customers, setCustomers] = useState([])
  const [selectedCustomerId, setSelectedCustomerId] = useState(0)
  const [draft, setDraft] = useState(() => buildCustomerEditorDraft())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    const handler = () => setSw(window.innerWidth)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  const selectedCustomer = useMemo(
    () => customers.find((customer) => Number(customer.id || 0) === Number(selectedCustomerId || 0)) || null,
    [customers, selectedCustomerId],
  )

  const loadCustomers = useCallback(async (search = '') => {
    const trimmedSearch = String(search || '').trim()
    if (trimmedSearch) setSearching(true)
    else setLoading(true)
    setError('')
    try {
      const result = await getSupervisorCustomers(trimmedSearch)
      const rows = unwrapCustomers(result)
        .map(normalizeSupervisorCustomer)
        .filter((customer) => customer.id)
      setCustomers(rows)
      setSelectedCustomerId((current) => {
        if (current && rows.some((customer) => Number(customer.id) === Number(current))) return current
        return Number(rows[0]?.id || 0)
      })
    } catch (e) {
      logScreenError('ScreenClientesSupervisor', 'loadCustomers', e)
      setCustomers([])
      setSelectedCustomerId(0)
      setError(buildCustomerErrorMessage(e))
    } finally {
      setLoading(false)
      setSearching(false)
    }
  }, [])

  useEffect(() => {
    loadCustomers('')
  }, [loadCustomers])

  useEffect(() => {
    if (!selectedCustomer) {
      setDraft(buildCustomerEditorDraft())
      return
    }
    setDraft(buildCustomerEditorDraft(selectedCustomer))
  }, [selectedCustomer])

  useEffect(() => {
    const handle = setTimeout(() => {
      loadCustomers(query)
    }, query.trim().length >= 2 ? 250 : 0)
    return () => clearTimeout(handle)
  }, [loadCustomers, query])

  const validationError = useMemo(() => getCustomerEditorValidationError(draft), [draft])
  const showUpdateButton = selectedCustomer && hasCustomerEditorChanges(selectedCustomer, draft)

  async function handleSave() {
    if (!selectedCustomer || validationError) return
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const payload = buildSupervisorCustomerUpdatePayload(selectedCustomer.id, selectedCustomer, draft)
      const result = await updateSupervisorCustomer(payload.customer_id, payload.values)
      if (result?.ok === false || result?.status === 'error') {
        throw result
      }
      const updatedCustomer = normalizeSupervisorCustomer(result?.data || selectedCustomer)
      setCustomers((current) => replaceCustomerInList(current, updatedCustomer))
      setSelectedCustomerId(updatedCustomer.id)
      setDraft(buildCustomerEditorDraft(updatedCustomer))
      setMessage('Datos del cliente actualizados en Odoo.')
    } catch (e) {
      logScreenError('ScreenClientesSupervisor', 'handleSave', e)
      setError(buildCustomerErrorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  const refreshBtn = (
    <button
      type="button"
      onClick={() => loadCustomers(query)}
      disabled={loading || saving}
      aria-label="Actualizar"
      style={{
        width: 38, height: 38, borderRadius: TOKENS.radius.md,
        background: TOKENS.colors.surface,
        border: `1px solid ${TOKENS.colors.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        opacity: loading || saving ? 0.6 : 1,
      }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="23 4 23 10 17 10" />
        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
      </svg>
    </button>
  )

  return (
    <ScreenShell title="Clientes" backTo="/equipo" rightAction={refreshBtn}>
      <p style={{ ...typo.caption, color: TOKENS.colors.textLow, margin: '4px 0 14px' }}>
        Clientes de la sucursal filtrados por la analitica del CEDIS actual.
      </p>

      {error && (
        <div style={{ marginBottom: 12, padding: 12, borderRadius: TOKENS.radius.md, background: TOKENS.colors.errorSoft, border: '1px solid rgba(239,68,68,0.22)' }}>
          <p style={{ ...typo.caption, color: TOKENS.colors.error, margin: 0 }}>{error}</p>
        </div>
      )}

      {message && (
        <div style={{ marginBottom: 12, padding: 12, borderRadius: TOKENS.radius.md, background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.22)' }}>
          <p style={{ ...typo.caption, color: '#86efac', margin: 0 }}>{message}</p>
        </div>
      )}

      <section>
        <p style={{ ...typo.overline, color: TOKENS.colors.textLow, margin: '0 0 10px' }}>BUSCAR CLIENTE</p>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nombre, telefono, mail o referencia"
          autoComplete="off"
          style={{
            width: '100%', padding: '12px 14px',
            borderRadius: TOKENS.radius.md,
            background: TOKENS.colors.surface,
            border: `1px solid ${TOKENS.colors.border}`,
            color: TOKENS.colors.text,
            fontSize: 14,
            outline: 'none',
          }}
        />
      </section>

      <section style={{ marginTop: 18 }}>
        <p style={{ ...typo.overline, color: TOKENS.colors.textLow, margin: '0 0 10px' }}>CLIENTES</p>
        {loading ? (
          <LoadingRows />
        ) : customers.length === 0 ? (
          <EmptyState
            icon="👤"
            title={query.trim() ? 'Sin resultados' : 'Sin clientes'}
            subtitle={query.trim() ? 'Prueba con otro nombre o referencia.' : 'No hay clientes disponibles para esta sucursal.'}
            typo={typo}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {customers.map((customer) => {
              const active = Number(customer.id) === Number(selectedCustomerId)
              return (
                <button
                  key={customer.id}
                  type="button"
                  onClick={() => setSelectedCustomerId(customer.id)}
                  style={{
                    width: '100%',
                    padding: '13px 14px',
                    borderRadius: TOKENS.radius.md,
                    textAlign: 'left',
                    background: active ? TOKENS.colors.blueGlow : TOKENS.glass.panel,
                    border: active ? `1px solid ${TOKENS.colors.blue2}` : `1px solid ${TOKENS.colors.border}`,
                    color: TOKENS.colors.text,
                  }}
                >
                  <span style={{ ...typo.body, fontWeight: 700 }}>{customer.name || `Cliente #${customer.id}`}</span>
                </button>
              )
            })}
          </div>
        )}
      </section>

      {selectedCustomer && (
        <section style={{ marginTop: 22 }}>
          <p style={{ ...typo.overline, color: TOKENS.colors.textLow, margin: '0 0 10px' }}>DETALLE DEL CLIENTE</p>
          <div style={{
            padding: 14,
            borderRadius: TOKENS.radius.lg,
            background: TOKENS.glass.panel,
            border: `1px solid ${TOKENS.colors.border}`,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}>
            <Field
              label="Nombre"
              value={draft.name}
              onChange={(value) => setDraft((current) => ({ ...current, name: value }))}
            />
            <Field
              label="Telefono"
              value={draft.phone}
              onChange={(value) => setDraft((current) => ({ ...current, phone: value }))}
            />
            <Field
              label="Mail"
              value={draft.email}
              onChange={(value) => setDraft((current) => ({ ...current, email: value }))}
            />
            <Field
              label="Latitud"
              value={draft.latitude}
              onChange={(value) => setDraft((current) => ({ ...current, latitude: value }))}
              inputMode="decimal"
            />
            <Field
              label="Longitud"
              value={draft.longitude}
              onChange={(value) => setDraft((current) => ({ ...current, longitude: value }))}
              inputMode="decimal"
            />
            <ReadOnlyField label="Direccion" value={selectedCustomer.address || 'Sin direccion capturada'} />
            <ReadOnlyField label="Referencia" value={selectedCustomer.reference || 'Sin referencia'} />

            {validationError && (
              <p style={{ ...typo.caption, color: TOKENS.colors.warning, margin: 0 }}>{validationError}</p>
            )}

            {showUpdateButton ? (
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !!validationError}
                style={{
                  marginTop: 4,
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: TOKENS.radius.md,
                  background: saving || validationError ? 'rgba(59,130,246,0.35)' : TOKENS.colors.blue2,
                  border: 'none',
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: saving || validationError ? 'not-allowed' : 'pointer',
                  opacity: saving ? 0.75 : 1,
                }}
              >
                {saving ? 'Actualizando...' : 'Actualizar datos'}
              </button>
            ) : (
              <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0 }}>
                Sin cambios pendientes.
              </p>
            )}
          </div>
        </section>
      )}

      {searching && !loading && (
        <p style={{ ...typo.caption, color: TOKENS.colors.textLow, marginTop: 12 }}>
          Actualizando lista de clientes...
        </p>
      )}

      <div style={{ height: 24 }} />
    </ScreenShell>
  )
}

function Field({ label, value, onChange, inputMode = 'text' }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: TOKENS.colors.textLow, letterSpacing: '0.08em' }}>
        {label.toUpperCase()}
      </span>
      <input
        type="text"
        value={value}
        inputMode={inputMode}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: '100%',
          padding: '11px 12px',
          borderRadius: TOKENS.radius.md,
          background: TOKENS.colors.surface,
          border: `1px solid ${TOKENS.colors.border}`,
          color: TOKENS.colors.text,
          fontSize: 14,
          outline: 'none',
        }}
      />
    </label>
  )
}

function ReadOnlyField({ label, value }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: TOKENS.colors.textLow, letterSpacing: '0.08em' }}>
        {label.toUpperCase()}
      </span>
      <div style={{
        padding: '11px 12px',
        borderRadius: TOKENS.radius.md,
        background: 'rgba(255,255,255,0.05)',
        border: `1px solid ${TOKENS.colors.border}`,
        color: TOKENS.colors.textMuted,
        fontSize: 14,
        lineHeight: 1.4,
      }}>
        {value}
      </div>
    </div>
  )
}

function LoadingRows() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {Array.from({ length: 5 }).map((_, index) => (
        <div
          key={index}
          style={{
            height: 48,
            borderRadius: TOKENS.radius.md,
            background: 'rgba(255,255,255,0.06)',
            border: `1px solid ${TOKENS.colors.border}`,
          }}
        />
      ))}
    </div>
  )
}
