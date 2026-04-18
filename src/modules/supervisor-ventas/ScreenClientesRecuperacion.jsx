// ─── ScreenClientesRecuperacion — Inactivos + Plan de Recuperación ─────────
// Guía de pruebas §6.
// Endpoints reales:
//   GET /pwa-supv/customers/inactive?company_id=&limit=&offset=
//   GET /pwa-supv/customers/recovery?company_id=&limit=&offset=
//
// Ambos retornan { ok, data: { total, customers: [...] } } según backend.

import { useEffect, useMemo, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../App'
import { TOKENS, getTypo } from '../../tokens'
import { useToast } from '../../components/Toast'
import { Loader, EmptyState, ErrorState } from '../../components/Loader'
import { getInactiveCustomers, getRecoveryCustomers } from '../admin/api'
import { logScreenError } from '../shared/logScreenError'

const PAGE_SIZE = 20

function unwrap(res) {
  if (res?.data?.customers) return res.data
  if (res?.customers) return res
  if (Array.isArray(res?.data)) return { customers: res.data, total: res.data.length }
  if (Array.isArray(res))       return { customers: res, total: res.length }
  return { customers: [], total: 0 }
}

export default function ScreenClientesRecuperacion() {
  const { session } = useSession()
  const navigate = useNavigate()
  const toast = useToast()
  const [sw, setSw] = useState(typeof window !== 'undefined' ? window.innerWidth : 1280)
  const typo = useMemo(() => getTypo(sw), [sw])

  const [tab, setTab] = useState('inactive') // 'inactive' | 'recovery'
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const h = () => setSw(window.innerWidth)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])

  const companyId = Number(session?.company_id || 0) || null

  const load = useCallback(async () => {
    if (!companyId) { setLoading(false); return }
    setLoading(true); setError('')
    try {
      const fetcher = tab === 'recovery' ? getRecoveryCustomers : getInactiveCustomers
      const res = await fetcher({ companyId, limit: PAGE_SIZE, offset })
      const payload = unwrap(res)
      setItems(Array.isArray(payload.customers) ? payload.customers : [])
      setTotal(Number(payload.total || 0))
    } catch (e) {
      logScreenError('ScreenClientesRecuperacion', 'load', e)
      setError(e?.message || 'Error al cargar clientes')
    } finally {
      setLoading(false)
    }
  }, [tab, offset, companyId])

  useEffect(() => { load() }, [load])

  useEffect(() => { setOffset(0) }, [tab])

  const hasMore = (offset + items.length) < total
  const hasPrev = offset > 0

  return (
    <div style={{
      minHeight: '100dvh',
      background: `linear-gradient(160deg, ${TOKENS.colors.bg0} 0%, ${TOKENS.colors.bg1} 50%, ${TOKENS.colors.bg2} 100%)`,
      paddingTop: 'env(safe-area-inset-top)',
      paddingBottom: 'env(safe-area-inset-bottom)',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap');
        * { font-family: 'DM Sans', sans-serif; box-sizing: border-box; }
        button { border: none; background: none; cursor: pointer; }
      `}</style>

      <div style={{ maxWidth: 520, margin: '0 auto', padding: '0 16px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 20, paddingBottom: 12 }}>
          <button onClick={() => navigate('/equipo')} style={{
            width: 38, height: 38, borderRadius: TOKENS.radius.md,
            background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
            </svg>
          </button>
          <span style={{ ...typo.title, color: TOKENS.colors.textSoft, flex: 1 }}>Gestión comercial</span>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'inline-flex', gap: 4, padding: 4, borderRadius: TOKENS.radius.md,
          background: TOKENS.colors.surfaceSoft, border: `1px solid ${TOKENS.colors.border}`,
          marginBottom: 12,
        }}>
          {[
            { id: 'inactive', label: 'Inactivos (>60d)' },
            { id: 'recovery', label: 'En recuperación' },
          ].map(t => {
            const active = tab === t.id
            return (
              <button key={t.id} onClick={() => setTab(t.id)} style={{
                padding: '8px 14px', borderRadius: TOKENS.radius.sm,
                background: active ? `${TOKENS.colors.blue2}22` : 'transparent',
                border: `1px solid ${active ? TOKENS.colors.blue2 : 'transparent'}`,
                fontSize: 12, fontWeight: 700,
                color: active ? TOKENS.colors.text : TOKENS.colors.textMuted,
              }}>{t.label}</button>
            )
          })}
        </div>

        {!companyId ? (
          <ErrorState title="Sin empresa seleccionada" message="Elige una razón social antes de continuar" />
        ) : loading ? (
          <Loader label="Cargando clientes…" />
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={tab === 'inactive' ? '🗓️' : '🔄'}
            title={tab === 'inactive' ? 'Sin clientes inactivos' : 'Sin clientes en recuperación'}
            subtitle={tab === 'inactive'
              ? 'Todos los clientes están activos en los últimos 60 días'
              : 'No hay planes de recuperación abiertos'}
          />
        ) : (
          <>
            <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '0 0 10px' }}>
              {total} {total === 1 ? 'cliente' : 'clientes'} · página {Math.floor(offset / PAGE_SIZE) + 1}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {items.map((c, i) => (
                <CustomerCard key={c.id ?? i} customer={c} typo={typo} tab={tab} />
              ))}
            </div>

            {/* Paginación */}
            {(hasPrev || hasMore) && (
              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <button
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                  disabled={!hasPrev}
                  style={{
                    flex: 1, padding: '10px 0', borderRadius: TOKENS.radius.md,
                    background: hasPrev ? TOKENS.colors.surface : TOKENS.colors.surfaceSoft,
                    border: `1px solid ${TOKENS.colors.border}`,
                    color: hasPrev ? TOKENS.colors.textSoft : TOKENS.colors.textMuted,
                    fontSize: 12, fontWeight: 600,
                    cursor: hasPrev ? 'pointer' : 'not-allowed',
                    opacity: hasPrev ? 1 : 0.5,
                  }}
                >← Anterior</button>
                <button
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                  disabled={!hasMore}
                  style={{
                    flex: 1, padding: '10px 0', borderRadius: TOKENS.radius.md,
                    background: hasMore ? TOKENS.colors.surface : TOKENS.colors.surfaceSoft,
                    border: `1px solid ${TOKENS.colors.border}`,
                    color: hasMore ? TOKENS.colors.textSoft : TOKENS.colors.textMuted,
                    fontSize: 12, fontWeight: 600,
                    cursor: hasMore ? 'pointer' : 'not-allowed',
                    opacity: hasMore ? 1 : 0.5,
                  }}
                >Siguiente →</button>
              </div>
            )}
          </>
        )}

        <div style={{ height: 40 }} />
      </div>
    </div>
  )
}

function CustomerCard({ customer, typo, tab }) {
  const name = customer.name || `Cliente #${customer.id}`
  const days = Number(customer.days_since_last_order || customer.days_since || 0)
  const lastOrder = customer.last_order_date || customer.last_order_at || ''
  const phone = customer.phone || customer.mobile || ''
  const category = customer.strategic_category || (tab === 'recovery' ? 'recuperacion' : '')
  const needsRecovery = Boolean(customer.needs_recovery_plan)

  return (
    <div style={{
      padding: 12, borderRadius: TOKENS.radius.md,
      background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <p style={{ ...typo.body, margin: 0, fontWeight: 700, color: TOKENS.colors.text }}>{name}</p>
        {days > 0 && (
          <span style={{
            padding: '2px 8px', borderRadius: TOKENS.radius.pill,
            fontSize: 10, fontWeight: 700,
            background: days > 90 ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
            color: days > 90 ? '#ef4444' : '#f59e0b',
          }}>{days} días</span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 11, color: TOKENS.colors.textMuted }}>
        {lastOrder && <span>📅 Última: {String(lastOrder).slice(0, 10)}</span>}
        {phone && <span>📞 {phone}</span>}
        {category && <span style={{ color: TOKENS.colors.blue3 }}>🏷️ {category}</span>}
        {needsRecovery && <span style={{ color: TOKENS.colors.warning }}>⚠ Plan de recuperación</span>}
      </div>
    </div>
  )
}
