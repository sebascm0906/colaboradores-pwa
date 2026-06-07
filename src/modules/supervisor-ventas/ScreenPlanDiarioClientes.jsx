import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSession } from '../../App'
import { TOKENS, getTypo } from '../../tokens'
import { ScreenShell, EmptyState } from '../entregas/components'
import {
  addCustomerToRoutePlan,
  getActiveRoutePlans,
  searchPlanningCustomers,
} from './api'
import {
  filterActiveRoutePlansByScope,
  getSupervisorRouteErrorMessage,
  normalizeActiveRoutePlan,
  normalizeCustomerSearchResult,
} from './routePlanning'
import { logScreenError } from '../shared/logScreenError'
import { getDayOverview } from './supvService'

function getTodayDateString(baseDate = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${baseDate.getFullYear()}-${pad(baseDate.getMonth() + 1)}-${pad(baseDate.getDate())}`
}

function unwrapList(payload) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.data)) return payload.data
  if (Array.isArray(payload?.data?.items)) return payload.data.items
  if (Array.isArray(payload?.data?.records)) return payload.data.records
  if (Array.isArray(payload?.items)) return payload.items
  if (Array.isArray(payload?.records)) return payload.records
  return []
}

export default function ScreenPlanDiarioClientes() {
  const { session } = useSession()
  const [sw, setSw] = useState(typeof window !== 'undefined' ? window.innerWidth : 1280)
  const typo = useMemo(() => getTypo(sw), [sw])
  const [dateTarget] = useState(() => getTodayDateString())
  const [plans, setPlans] = useState([])
  const [selectedPlanId, setSelectedPlanId] = useState('')
  const [query, setQuery] = useState('')
  const [customers, setCustomers] = useState([])
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const selectedPlan = useMemo(
    () => plans.find((plan) => String(plan.id) === String(selectedPlanId)) || null,
    [plans, selectedPlanId],
  )

  useEffect(() => {
    const handler = () => setSw(window.innerWidth)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  const loadPlans = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [result, overview] = await Promise.all([
        getActiveRoutePlans(dateTarget),
        getDayOverview(dateTarget),
      ])
      const rows = filterActiveRoutePlansByScope(
        unwrapList(result).map(normalizeActiveRoutePlan).filter((plan) => plan.id),
        overview?.vendors || [],
      )
      setPlans(rows)
      setSelectedPlanId((current) => {
        if (current && rows.some((plan) => String(plan.id) === String(current))) return current
        return rows[0]?.id ? String(rows[0].id) : ''
      })
    } catch (e) {
      logScreenError('ScreenPlanDiarioClientes', 'getActiveRoutePlans', e)
      setError(e.message === 'no_session' ? 'Sesion vencida, vuelve a ingresar.' : 'No se pudieron cargar los planes activos.')
    } finally {
      setLoading(false)
    }
  }, [dateTarget])

  useEffect(() => { loadPlans() }, [loadPlans])

  useEffect(() => {
    const needle = query.trim()
    setSelectedCustomer(null)
    setMessage('')
    if (needle.length < 2) {
      setCustomers([])
      setSearching(false)
      return undefined
    }
    setSearching(true)
    const timer = setTimeout(async () => {
      try {
        const result = await searchPlanningCustomers(needle)
        setCustomers(unwrapList(result).map(normalizeCustomerSearchResult).filter((customer) => customer.id))
      } catch (e) {
        logScreenError('ScreenPlanDiarioClientes', 'searchPlanningCustomers', e)
        setCustomers([])
        setError(e.message === 'no_session' ? 'Sesion vencida, vuelve a ingresar.' : 'No se pudieron buscar clientes.')
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  async function handleAddCustomer() {
    if (!selectedPlan || !selectedCustomer) return
    setSubmitting(true)
    setError('')
    setMessage('')
    try {
      const result = await addCustomerToRoutePlan(selectedPlan.id, selectedCustomer.id, notes)
      if (result?.ok === false || result?.status === 'error') {
        throw new Error(getSupervisorRouteErrorMessage(result))
      }
      setMessage(`${selectedCustomer.name} se agrego al plan ${selectedPlan.route_name || selectedPlan.name}.`)
      setQuery('')
      setCustomers([])
      setSelectedCustomer(null)
      setNotes('')
      await loadPlans()
    } catch (e) {
      logScreenError('ScreenPlanDiarioClientes', 'addCustomerToRoutePlan', e)
      setError(getSupervisorRouteErrorMessage(e))
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmit = !!selectedPlan && !!selectedCustomer && !submitting

  const refreshBtn = (
    <button
      type="button"
      onClick={loadPlans}
      disabled={loading}
      aria-label="Actualizar"
      style={{
        width: 38, height: 38, borderRadius: TOKENS.radius.md,
        background: TOKENS.colors.surface,
        border: `1px solid ${TOKENS.colors.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        opacity: loading ? 0.6 : 1,
      }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="23 4 23 10 17 10" />
        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
      </svg>
    </button>
  )

  return (
    <ScreenShell title="Agregar cliente a plan" backTo="/equipo" rightAction={refreshBtn}>
      <p style={{ ...typo.caption, color: TOKENS.colors.textLow, margin: '4px 0 14px' }}>
        {session?.employee_name ? `${session.employee_name} · ` : ''}{dateTarget}
      </p>

      {error && (
        <div style={{ marginBottom: 12, padding: 12, borderRadius: TOKENS.radius.md, background: TOKENS.colors.errorSoft, border: `1px solid rgba(239,68,68,0.22)` }}>
          <p style={{ ...typo.caption, color: TOKENS.colors.error, margin: 0 }}>{error}</p>
        </div>
      )}
      {message && (
        <div style={{ marginBottom: 12, padding: 12, borderRadius: TOKENS.radius.md, background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.24)' }}>
          <p style={{ ...typo.caption, color: '#86efac', margin: 0 }}>{message}</p>
        </div>
      )}

      <section>
        <p style={{ ...typo.overline, color: TOKENS.colors.textLow, margin: '0 0 10px' }}>PLAN ACTIVO</p>
        {loading ? (
          <LoadingBlock />
        ) : plans.length === 0 ? (
          <EmptyState icon="📍" title="Sin planes activos" subtitle="No hay planes diarios editables para hoy." typo={typo} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {plans.map((plan) => {
              const active = String(plan.id) === String(selectedPlanId)
              return (
                <button
                  key={plan.id}
                  type="button"
                  onClick={() => setSelectedPlanId(String(plan.id))}
                  style={{
                    width: '100%', padding: 12, borderRadius: TOKENS.radius.md,
                    background: active ? TOKENS.colors.blueGlow : TOKENS.glass.panel,
                    border: active ? `1px solid ${TOKENS.colors.blue2}` : `1px solid ${TOKENS.colors.border}`,
                    textAlign: 'left',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ ...typo.body, color: TOKENS.colors.text, fontWeight: 700, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {plan.route_name || plan.name || `Plan ${plan.id}`}
                      </p>
                      <p style={{ ...typo.caption, color: TOKENS.colors.textLow, margin: '4px 0 0' }}>
                        {plan.driver_name || 'Chofer sin asignar'}
                      </p>
                    </div>
                    <span style={{
                      flexShrink: 0, padding: '4px 8px', borderRadius: TOKENS.radius.pill,
                      background: 'rgba(255,255,255,0.08)', color: TOKENS.colors.textSoft,
                      fontSize: 12, fontWeight: 700,
                    }}>
                      {plan.stops_total} stops
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </section>

      <section style={{ marginTop: 20 }}>
        <p style={{ ...typo.overline, color: TOKENS.colors.textLow, margin: '0 0 10px' }}>CLIENTE</p>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nombre, codigo o direccion"
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

        {searching && <p style={{ ...typo.caption, color: TOKENS.colors.textLow, margin: '10px 0 0' }}>Buscando clientes...</p>}

        {!searching && query.trim().length >= 2 && customers.length === 0 && (
          <div style={{ marginTop: 10 }}>
            <EmptyState icon="🔎" title="Sin resultados" subtitle="Intenta con otro nombre o codigo." typo={typo} />
          </div>
        )}

        {customers.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
            {customers.map((customer) => {
              const active = selectedCustomer?.id === customer.id
              return (
                <button
                  key={customer.id}
                  type="button"
                  onClick={() => setSelectedCustomer(customer)}
                  style={{
                    padding: 12, borderRadius: TOKENS.radius.md,
                    background: active ? TOKENS.colors.blueGlow : TOKENS.glass.panel,
                    border: active ? `1px solid ${TOKENS.colors.blue2}` : `1px solid ${TOKENS.colors.border}`,
                    textAlign: 'left',
                  }}
                >
                  <p style={{ ...typo.body, color: TOKENS.colors.text, fontWeight: 700, margin: 0 }}>{customer.name}</p>
                  {customer.address && (
                    <p style={{ ...typo.caption, color: TOKENS.colors.textLow, margin: '5px 0 0' }}>{customer.address}</p>
                  )}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                    {customer.channels.slice(0, 3).map((channel) => (
                      <span key={channel} style={pillStyle()}>{channel}</span>
                    ))}
                    {customer.time_window && <span style={pillStyle()}>{customer.time_window}</span>}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </section>

      <section style={{ marginTop: 18 }}>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notas para la parada"
          rows={3}
          maxLength={500}
          style={{
            width: '100%', padding: '12px 14px',
            borderRadius: TOKENS.radius.md,
            background: TOKENS.colors.surface,
            border: `1px solid ${TOKENS.colors.border}`,
            color: TOKENS.colors.text,
            fontSize: 14,
            outline: 'none',
            resize: 'vertical',
          }}
        />
      </section>

      <button
        type="button"
        disabled={!canSubmit}
        onClick={handleAddCustomer}
        style={{
          width: '100%', minHeight: 48, marginTop: 16,
          borderRadius: TOKENS.radius.md,
          border: 'none',
          background: canSubmit ? TOKENS.colors.blue2 : 'rgba(255,255,255,0.08)',
          color: canSubmit ? '#06121f' : TOKENS.colors.textLow,
          fontWeight: 800,
          fontSize: 14,
        }}
      >
        {submitting ? 'Agregando...' : 'Agregar al plan'}
      </button>
    </ScreenShell>
  )
}

function LoadingBlock() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 42 }}>
      <div style={{
        width: 30, height: 30, borderRadius: '50%',
        border: '2px solid rgba(255,255,255,0.12)',
        borderTop: `2px solid ${TOKENS.colors.blue2}`,
        animation: 'entregasShellSpin 0.8s linear infinite',
      }} />
    </div>
  )
}

function pillStyle() {
  return {
    padding: '3px 7px',
    borderRadius: TOKENS.radius.pill,
    background: 'rgba(255,255,255,0.08)',
    color: TOKENS.colors.textLow,
    fontSize: 11,
    fontWeight: 700,
  }
}
