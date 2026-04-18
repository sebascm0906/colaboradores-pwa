import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TOKENS, getTypo } from '../../tokens'
import { ScreenShell, StatusBadge, EmptyState } from '../entregas/components'
import {
  getDayOverview, getYesterdaySummary, getStatusColor, getComplianceColor,
  fmtMoney, fmtTime, getDepartureStatus, getLiquidationStatus,
} from './supvService'

/* ============================================================================
   ScreenControlComercial — Centro de Control Comercial (V2 Hub)
   Supports Hoy / Ayer toggle for daily and yesterday comparison.
============================================================================ */

export default function ScreenControlComercial() {
  const navigate = useNavigate()
  const [sw, setSw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])

  const [tab, setTab] = useState('hoy') // 'hoy' | 'ayer'
  const [dataHoy, setDataHoy] = useState(null)
  const [dataAyer, setDataAyer] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const h = () => setSw(window.innerWidth)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [hoy, ayer] = await Promise.allSettled([getDayOverview(), getYesterdaySummary()])
      if (hoy.status === 'fulfilled') setDataHoy(hoy.value)
      if (ayer.status === 'fulfilled') setDataAyer(ayer.value)
      if (hoy.status === 'rejected' && hoy.reason?.message !== 'no_session') setError('Error al cargar datos')
    } catch (e) {
      if (e.message !== 'no_session') setError('Error al cargar datos')
    } finally {
      setLoading(false)
    }
  }

  const data = tab === 'hoy' ? dataHoy : dataAyer

  /* ── Refresh button ──────────────────────────────────────────────────────── */
  const refreshBtn = (
    <button
      onClick={load}
      style={{
        width: 38, height: 38, borderRadius: TOKENS.radius.md,
        background: TOKENS.colors.surface,
        border: `1px solid ${TOKENS.colors.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="23 4 23 10 17 10" />
        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
      </svg>
    </button>
  )

  /* ── Loading / Error ─────────────────────────────────────────────────────── */
  if (loading) {
    return (
      <ScreenShell title="Control Comercial" backTo="/" rightAction={refreshBtn}>
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
          <div style={{
            width: 32, height: 32,
            border: '2px solid rgba(255,255,255,0.12)',
            borderTop: `2px solid ${TOKENS.colors.blue2}`,
            borderRadius: '50%',
            animation: 'entregasShellSpin 0.8s linear infinite',
          }} />
        </div>
      </ScreenShell>
    )
  }

  if (error) {
    return (
      <ScreenShell title="Control Comercial" backTo="/" rightAction={refreshBtn}>
        <div style={{ margin: '12px 0', padding: 12, borderRadius: 10, background: TOKENS.colors.errorSoft, border: `1px solid rgba(239,68,68,0.2)` }}>
          <p style={{ ...typo.caption, color: TOKENS.colors.error, margin: 0 }}>{error}</p>
        </div>
      </ScreenShell>
    )
  }

  if (!data) {
    return (
      <ScreenShell title="Control Comercial" backTo="/" rightAction={refreshBtn}>
        <TabBar tab={tab} setTab={setTab} typo={typo} hasAyer={!!dataAyer} />
        <EmptyState icon="📊" title="Sin datos" subtitle="No hay informacion disponible" typo={typo} />
      </ScreenShell>
    )
  }

  const {
    avg_compliance, total_stops, done_stops, pending_stops,
    total_sales_target, total_sales_actual,
    vendors_critical, vendors = [],
    departed = 0, not_departed = 0, departed_late = 0,
    closed = 0, liquidated = 0, pending_liquidation = 0,
    is_today,
  } = data

  const complianceColor = getComplianceColor(avg_compliance)
  const visitsPct = total_stops > 0 ? Math.round((done_stops / total_stops) * 100) : 0
  const visitsColor = getComplianceColor(visitsPct)
  const salesPct = total_sales_target > 0 ? Math.round((total_sales_actual / total_sales_target) * 100) : 0
  const salesColor = getComplianceColor(salesPct)

  return (
    <ScreenShell title="Control Comercial" backTo="/" rightAction={refreshBtn}>

      {/* ── Tab Bar: Hoy / Ayer ──────────────────────────────────────────── */}
      <TabBar tab={tab} setTab={setTab} typo={typo} hasAyer={!!dataAyer} />

      {/* ── Section A: KPI Cards ──────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 8 }}>
        <KpiCard typo={typo} label="Cumplimiento" value={`${avg_compliance}%`} color={complianceColor} pct={avg_compliance} />
        <KpiCard typo={typo} label="Visitas" value={`${done_stops}/${total_stops}`} color={visitsColor} pct={visitsPct} />
        <KpiCard typo={typo} label="Ventas mes" value={fmtMoney(total_sales_actual)} sub={`/ ${fmtMoney(total_sales_target)}`} color={salesColor} pct={salesPct} />
      </div>

      {/* ── Section B: Departure + Liquidation Strip ─────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
        <InfoStrip typo={typo} label="Salidas" items={[
          { text: `${departed} salieron`, color: '#22c55e' },
          ...(not_departed > 0 ? [{ text: `${not_departed} sin salir`, color: '#f59e0b' }] : []),
          ...(departed_late > 0 ? [{ text: `${departed_late} tarde`, color: '#ef4444' }] : []),
        ]} />
        <InfoStrip typo={typo} label="Liquidaciones" items={[
          { text: `${liquidated} liquidados`, color: '#22c55e' },
          ...(pending_liquidation > 0 ? [{ text: `${pending_liquidation} pendientes`, color: '#f59e0b' }] : []),
          ...(closed > 0 ? [{ text: `${closed} cerrados`, color: TOKENS.colors.textSoft }] : []),
        ]} />
      </div>

      {/* ── Section C: Alerts ─────────────────────────────────────────────── */}
      {(vendors_critical > 0 || pending_stops > 30 || pending_liquidation > 0) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
          {vendors_critical > 0 && (
            <AlertBanner
              typo={typo}
              color={TOKENS.colors.error}
              bg={TOKENS.colors.errorSoft}
              text={`${vendors_critical} vendedor${vendors_critical > 1 ? 'es' : ''} con cumplimiento critico`}
            />
          )}
          {is_today && not_departed > 0 && (
            <AlertBanner
              typo={typo}
              color={TOKENS.colors.warning}
              bg={TOKENS.colors.warningSoft}
              text={`${not_departed} vendedor${not_departed > 1 ? 'es' : ''} sin salir`}
            />
          )}
          {pending_liquidation > 0 && (
            <AlertBanner
              typo={typo}
              color={TOKENS.colors.warning}
              bg={TOKENS.colors.warningSoft}
              text={`${pending_liquidation} liquidacion${pending_liquidation > 1 ? 'es' : ''} pendiente${pending_liquidation > 1 ? 's' : ''}`}
            />
          )}
        </div>
      )}

      {/* ── Section D: Vendor List ────────────────────────────────────────── */}
      <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginTop: 20, marginBottom: 10 }}>
        EQUIPO ({vendors.length})
      </p>

      {vendors.length === 0 ? (
        <EmptyState icon="👤" title="Sin vendedores" subtitle="No se encontraron vendedores en el equipo" typo={typo} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {vendors.map((v) => (
            <VendorRow key={v.id} v={v} typo={typo} navigate={navigate} showDeparture={is_today} />
          ))}
        </div>
      )}

      {/* ── Section E: Quick Actions ──────────────────────────────────────── */}
      <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginTop: 24, marginBottom: 10 }}>
        ACCIONES RAPIDAS
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        {QUICK_ACTIONS.map((qa) => (
          <button
            key={qa.route}
            onClick={() => navigate(qa.route)}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
              padding: '14px 6px', borderRadius: TOKENS.radius.lg,
              background: TOKENS.glass.panel,
              border: `1px solid ${TOKENS.colors.border}`,
              cursor: 'pointer',
            }}
          >
            <div style={{
              width: 36, height: 36, borderRadius: TOKENS.radius.sm,
              background: `${qa.color}14`, border: `1px solid ${qa.color}30`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: qa.color,
            }}>
              {qa.icon}
            </div>
            <span style={{ ...typo.caption, color: TOKENS.colors.textSoft, textAlign: 'center', lineHeight: 1.3 }}>
              {qa.label}
            </span>
          </button>
        ))}
      </div>

      <div style={{ height: 24 }} />
    </ScreenShell>
  )
}

/* ── Sub-components ──────────────────────────────────────────────────────── */

function TabBar({ tab, setTab, typo, hasAyer }) {
  return (
    <div style={{
      display: 'flex', gap: 4, marginTop: 4, padding: 3,
      borderRadius: TOKENS.radius.pill,
      background: 'rgba(255,255,255,0.06)',
      border: `1px solid ${TOKENS.colors.border}`,
    }}>
      {['hoy', 'ayer'].map((t) => {
        if (t === 'ayer' && !hasAyer) return null
        const active = tab === t
        return (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              flex: 1, padding: '8px 0',
              borderRadius: TOKENS.radius.pill,
              background: active ? TOKENS.colors.surface : 'transparent',
              border: active ? `1px solid ${TOKENS.colors.borderBlue}` : '1px solid transparent',
              color: active ? TOKENS.colors.text : TOKENS.colors.textMuted,
              fontSize: 13, fontWeight: active ? 700 : 500,
              cursor: 'pointer',
              transition: `all ${TOKENS.motion.fast}`,
            }}
          >
            {t === 'hoy' ? 'Hoy' : 'Ayer'}
          </button>
        )
      })}
    </div>
  )
}

function KpiCard({ typo, label, value, sub, color, pct }) {
  return (
    <div style={{
      padding: '12px 8px', borderRadius: TOKENS.radius.lg,
      background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
      textAlign: 'center',
    }}>
      <p style={{ ...typo.overline, color: TOKENS.colors.textMuted, margin: 0, marginBottom: 6, fontSize: 9 }}>
        {label.toUpperCase()}
      </p>
      <p style={{ fontSize: 18, fontWeight: 700, color, margin: 0, letterSpacing: '-0.02em' }}>
        {value}
      </p>
      {sub && (
        <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, marginTop: 2, fontSize: 10 }}>
          {sub}
        </p>
      )}
      {/* Progress bar */}
      <div style={{
        marginTop: 8, height: 4, borderRadius: 2,
        background: 'rgba(255,255,255,0.08)', overflow: 'hidden',
      }}>
        <div style={{
          height: '100%', width: `${Math.min(pct, 100)}%`,
          borderRadius: 2, background: color,
          transition: `width ${TOKENS.motion.normal}`,
        }} />
      </div>
    </div>
  )
}

function InfoStrip({ typo, label, items }) {
  return (
    <div style={{
      padding: '10px 10px', borderRadius: TOKENS.radius.md,
      background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
    }}>
      <p style={{ ...typo.overline, color: TOKENS.colors.textMuted, margin: 0, marginBottom: 6, fontSize: 9 }}>
        {label.toUpperCase()}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {items.map((item, i) => (
          <span key={i} style={{ ...typo.caption, color: item.color, fontWeight: 600, fontSize: 11 }}>
            {item.text}
          </span>
        ))}
      </div>
    </div>
  )
}

function AlertBanner({ typo, color, bg, text }) {
  return (
    <div style={{
      padding: '10px 14px', borderRadius: TOKENS.radius.sm,
      background: bg, border: `1px solid ${color}30`,
      display: 'flex', alignItems: 'center', gap: 8,
    }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
      <span style={{ ...typo.caption, color, fontWeight: 600, flex: 1 }}>{text}</span>
    </div>
  )
}

function VendorRow({ v, typo, navigate, showDeparture }) {
  const compColor = getComplianceColor(v.compliance)
  const statusColor = getStatusColor(v.status)
  const depStatus = getDepartureStatus(v)
  const liqStatus = getLiquidationStatus(v)

  return (
    <button
      onClick={() => navigate(`/equipo/vendedor/${v.id}?route_id=${v.route_id || ''}`)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '12px 14px', borderRadius: TOKENS.radius.lg,
        background: TOKENS.glass.panel,
        border: `1px solid ${TOKENS.colors.border}`,
        boxShadow: TOKENS.shadow.soft,
        width: '100%', textAlign: 'left', cursor: 'pointer',
      }}
    >
      {/* Status dot */}
      <div style={{
        width: 10, height: 10, borderRadius: '50%',
        background: statusColor, flexShrink: 0,
        boxShadow: `0 0 6px ${statusColor}60`,
      }} />

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ ...typo.body, color: TOKENS.colors.text, margin: 0, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {v.name}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
          <span style={{ ...typo.caption, color: TOKENS.colors.textMuted }}>
            {v.stops_done}/{v.stops_total}
          </span>
          <span style={{ ...typo.caption, color: TOKENS.colors.textMuted }}>
            {fmtMoney(v.sales_actual)}
          </span>
          {/* Departure indicator */}
          {showDeparture && v.has_route && (
            <span style={{ ...typo.caption, color: depStatus.color, fontWeight: 600, fontSize: 10 }}>
              {depStatus.icon} {v.has_departed ? fmtTime(v.departure_real) : 'Sin salir'}
            </span>
          )}
          {/* Liquidation indicator (yesterday or closed routes) */}
          {v.is_closed && (
            <span style={{ ...typo.caption, color: liqStatus.color, fontWeight: 600, fontSize: 10 }}>
              {v.is_liquidated ? '✓ Liq.' : '⏳ Pend.'}
            </span>
          )}
        </div>
        {/* Compliance bar */}
        <div style={{
          marginTop: 6, height: 4, borderRadius: 2,
          background: 'rgba(255,255,255,0.08)', overflow: 'hidden',
        }}>
          <div style={{
            height: '100%', width: `${Math.min(v.compliance, 100)}%`,
            borderRadius: 2, background: compColor,
            transition: `width ${TOKENS.motion.normal}`,
          }} />
        </div>
      </div>

      {/* Compliance % */}
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <p style={{ fontSize: 16, fontWeight: 700, color: compColor, margin: 0, letterSpacing: '-0.02em' }}>
          {v.compliance}%
        </p>
      </div>

      {/* Chevron */}
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
        <path d="M9 18l6-6-6-6" />
      </svg>
    </button>
  )
}

/* ── Quick Actions config ────────────────────────────────────────────────── */

const QUICK_ACTIONS = [
  {
    label: 'Sin visitar',
    route: '/equipo/sin-visitar',
    color: TOKENS.colors.error,
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>,
  },
  {
    label: 'Score semanal',
    route: '/equipo/score-semanal',
    color: TOKENS.colors.blue3,
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="9" y1="21" x2="9" y2="9" /></svg>,
  },
  {
    label: 'Cierre del dia',
    route: '/equipo/cierre',
    color: '#a78bfa',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>,
  },
  {
    label: 'Pronostico',
    route: '/equipo/pronostico',
    color: TOKENS.colors.warning,
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></svg>,
  },
  {
    label: 'Metas',
    route: '/equipo/metas',
    color: TOKENS.colors.blue2,
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></svg>,
  },
  {
    label: 'Dashboard',
    route: '/equipo/dashboard',
    color: '#60a5fa',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>,
  },
  {
    label: 'Tareas',
    route: '/equipo/tareas',
    color: '#22c55e',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>,
  },
  {
    label: 'Notas',
    route: '/equipo/notas',
    color: '#f59e0b',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  },
]
