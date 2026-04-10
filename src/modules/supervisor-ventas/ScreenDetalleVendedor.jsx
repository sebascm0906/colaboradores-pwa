import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { TOKENS, getTypo } from '../../tokens'
import { ScreenShell, StatusBadge, EmptyState } from '../entregas/components'
import {
  getDayOverview, getRouteStops, getComplianceColor, getStatusColor,
  fmtMoney, fmtTime, getDepartureStatus, getLiquidationStatus,
} from './supvService'

/* ============================================================================
   ScreenDetalleVendedor — Vendor detail with route stops, departure,
   liquidation status, and operational KPIs.
============================================================================ */

export default function ScreenDetalleVendedor() {
  const { vendedorId } = useParams()
  const [searchParams] = useSearchParams()
  const routeId = searchParams.get('route_id')

  const [sw, setSw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])

  const [vendor, setVendor] = useState(null)
  const [stops, setStops] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const h = () => setSw(window.innerWidth)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])

  useEffect(() => { load() }, [vendedorId, routeId])

  async function load() {
    setLoading(true)
    setError('')
    try {
      const overview = await getDayOverview()
      const v = overview.vendors?.find((x) => String(x.id) === String(vendedorId))
      setVendor(v || null)

      if (routeId && routeId !== 'null' && routeId !== '') {
        const stopsData = await getRouteStops(routeId)
        setStops(Array.isArray(stopsData) ? stopsData : [])
      }
    } catch (e) {
      if (e.message !== 'no_session') setError('Error al cargar datos del vendedor')
    } finally {
      setLoading(false)
    }
  }

  const title = vendor?.name || 'Vendedor'
  const compColor = vendor ? getComplianceColor(vendor.compliance) : TOKENS.colors.textMuted
  const statusColor = vendor ? getStatusColor(vendor.status) : TOKENS.colors.textMuted

  // Stop summary counts
  const visited = stops.filter((s) => isVisited(s.result_status)).length
  const notVisited = stops.filter((s) => isNotVisited(s.result_status)).length
  const withSale = stops.filter((s) => s.sales_count > 0).length

  /* ── Loading ─────────────────────────────────────────────────────────────── */
  if (loading) {
    return (
      <ScreenShell title="Cargando..." backTo="/equipo">
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
      <ScreenShell title="Error" backTo="/equipo">
        <div style={{ margin: '12px 0', padding: 12, borderRadius: 10, background: TOKENS.colors.errorSoft, border: '1px solid rgba(239,68,68,0.2)' }}>
          <p style={{ ...typo.caption, color: TOKENS.colors.error, margin: 0 }}>{error}</p>
        </div>
      </ScreenShell>
    )
  }

  if (!vendor) {
    return (
      <ScreenShell title="Vendedor" backTo="/equipo">
        <EmptyState icon="👤" title="Vendedor no encontrado" subtitle="No se encontro informacion de este vendedor" typo={typo} />
      </ScreenShell>
    )
  }

  const depStatus = getDepartureStatus(vendor)
  const liqStatus = getLiquidationStatus(vendor)

  return (
    <ScreenShell title={title} backTo="/equipo">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div style={{
        padding: '16px', borderRadius: TOKENS.radius.xl,
        background: TOKENS.glass.hero,
        border: `1px solid ${TOKENS.colors.borderBlue}`,
        marginTop: 4,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Status dot */}
          <div style={{
            width: 14, height: 14, borderRadius: '50%',
            background: statusColor, flexShrink: 0,
            boxShadow: `0 0 8px ${statusColor}60`,
          }} />
          <div style={{ flex: 1 }}>
            <p style={{ ...typo.h2, color: TOKENS.colors.text, margin: 0 }}>{vendor.name}</p>
            {vendor.route_name && (
              <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, marginTop: 2 }}>
                {vendor.route_name}
              </p>
            )}
          </div>
          <StatusBadge status={vendorStatusToBadge(vendor.status)} label={vendorStatusLabel(vendor.status)} />
        </div>

        {/* Phone */}
        {vendor.phone && (
          <a
            href={`tel:${vendor.phone}`}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              marginTop: 12, padding: '8px 16px',
              borderRadius: TOKENS.radius.pill,
              background: `${TOKENS.colors.blue2}18`,
              border: `1px solid ${TOKENS.colors.blue2}30`,
              color: TOKENS.colors.blue3,
              fontSize: 13, fontWeight: 600,
              textDecoration: 'none',
              cursor: 'pointer',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
            Llamar
          </a>
        )}
      </div>

      {/* ── Section A: Day KPIs ───────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 14 }}>
        <MiniKpi typo={typo} label="Cumplimiento" value={`${vendor.compliance}%`} color={compColor} />
        <MiniKpi typo={typo} label="Visitas" value={`${vendor.stops_done}/${vendor.stops_total}`} color={getComplianceColor(vendor.stops_total > 0 ? Math.round((vendor.stops_done / vendor.stops_total) * 100) : 0)} />
        <MiniKpi typo={typo} label="Ventas del mes" value={fmtMoney(vendor.sales_actual)} color={TOKENS.colors.blue3} />
        <MiniKpi typo={typo} label="Efectividad" value={`${vendor.effectiveness || 0}%`} color={getComplianceColor(vendor.effectiveness || 0)} />
      </div>

      {/* ── Section B: Departure & Liquidation ────────────────────────────── */}
      {vendor.has_route && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
          <StatusCard
            typo={typo}
            label="Salida"
            value={vendor.has_departed ? fmtTime(vendor.departure_real) : 'Sin salir'}
            sub={vendor.departure_target ? `Meta: ${fmtTime(vendor.departure_target)}` : null}
            color={depStatus.color}
          />
          <StatusCard
            typo={typo}
            label="Liquidacion"
            value={liqStatus.label}
            sub={vendor.closure_time ? `Cierre: ${fmtTime(vendor.closure_time)}` : null}
            color={liqStatus.color}
          />
        </div>
      )}

      {/* Force close reason */}
      {vendor.force_close_reason && (
        <div style={{
          marginTop: 8, padding: '10px 14px', borderRadius: TOKENS.radius.sm,
          background: TOKENS.colors.errorSoft, border: `1px solid rgba(239,68,68,0.2)`,
        }}>
          <p style={{ ...typo.caption, color: TOKENS.colors.error, margin: 0 }}>
            Cierre forzado: {vendor.force_close_reason}
          </p>
        </div>
      )}

      {/* ── Section C: Client List (stops) ────────────────────────────────── */}
      <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginTop: 20, marginBottom: 10 }}>
        CLIENTES ({stops.length})
      </p>

      {stops.length === 0 ? (
        <EmptyState
          icon="📍"
          title="Sin paradas"
          subtitle={routeId ? 'No se encontraron paradas para esta ruta' : 'Este vendedor no tiene ruta asignada hoy'}
          typo={typo}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {stops.map((stop) => (
            <StopCard key={stop.id} stop={stop} typo={typo} />
          ))}
        </div>
      )}

      {/* ── Section D: Summary footer ─────────────────────────────────────── */}
      {stops.length > 0 && (
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8,
          marginTop: 16, padding: '14px 10px',
          borderRadius: TOKENS.radius.lg,
          background: TOKENS.glass.panel,
          border: `1px solid ${TOKENS.colors.border}`,
        }}>
          <SummaryItem typo={typo} label="Visitados" value={visited} color={TOKENS.colors.success} />
          <SummaryItem typo={typo} label="No visitados" value={notVisited} color={TOKENS.colors.error} />
          <SummaryItem typo={typo} label="Con venta" value={withSale} color={TOKENS.colors.blue3} />
        </div>
      )}

      <div style={{ height: 24 }} />
    </ScreenShell>
  )
}

/* ── Sub-components ──────────────────────────────────────────────────────── */

function MiniKpi({ typo, label, value, color }) {
  return (
    <div style={{
      padding: '10px 12px', borderRadius: TOKENS.radius.md,
      background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
    }}>
      <p style={{ ...typo.overline, color: TOKENS.colors.textMuted, margin: 0, fontSize: 9 }}>
        {label.toUpperCase()}
      </p>
      <p style={{ fontSize: 17, fontWeight: 700, color, margin: 0, marginTop: 4, letterSpacing: '-0.02em' }}>
        {value}
      </p>
    </div>
  )
}

function StatusCard({ typo, label, value, sub, color }) {
  return (
    <div style={{
      padding: '10px 12px', borderRadius: TOKENS.radius.md,
      background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
      borderLeft: `3px solid ${color}`,
    }}>
      <p style={{ ...typo.overline, color: TOKENS.colors.textMuted, margin: 0, fontSize: 9 }}>
        {label.toUpperCase()}
      </p>
      <p style={{ fontSize: 14, fontWeight: 700, color, margin: 0, marginTop: 4 }}>
        {value}
      </p>
      {sub && (
        <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, marginTop: 2, fontSize: 10 }}>
          {sub}
        </p>
      )}
    </div>
  )
}

function StopCard({ stop, typo }) {
  const resultColor = getResultColor(stop.result_status)
  const resultLabel = getResultLabel(stop.result_status)

  return (
    <div style={{
      padding: '12px 14px', borderRadius: TOKENS.radius.lg,
      background: TOKENS.glass.panel,
      border: `1px solid ${TOKENS.colors.border}`,
      borderLeft: `3px solid ${resultColor}`,
    }}>
      {/* Row 1: Sequence + Customer + Badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          width: 24, height: 24, borderRadius: '50%',
          background: 'rgba(255,255,255,0.08)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 700, color: TOKENS.colors.textMuted,
          flexShrink: 0,
        }}>
          {stop.sequence || '-'}
        </span>
        <span style={{
          ...typo.body, color: TOKENS.colors.text, fontWeight: 600,
          flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {stop.customer || 'Cliente'}
        </span>
        <StatusBadge status={resultToBadgeStatus(stop.result_status)} label={resultLabel} />
      </div>

      {/* Row 2: Details */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 8, paddingLeft: 32 }}>
        {stop.start_time && (
          <Detail typo={typo} label="Hora" value={fmtTime(stop.start_time)} />
        )}
        {stop.duration_min != null && stop.duration_min > 0 && (
          <Detail typo={typo} label="Duracion" value={`${stop.duration_min} min`} />
        )}
        {stop.sales_count > 0 && (
          <Detail typo={typo} label="Ventas" value={stop.sales_count} />
        )}
        {stop.has_checkin && (
          <span style={{
            ...typo.caption, color: TOKENS.colors.success,
            display: 'flex', alignItems: 'center', gap: 3,
          }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            Check-in
          </span>
        )}
      </div>

      {/* Not visited reason */}
      {stop.not_visited_reason && (
        <p style={{ ...typo.caption, color: TOKENS.colors.warning, margin: 0, marginTop: 6, paddingLeft: 32 }}>
          Motivo: {stop.not_visited_reason}
        </p>
      )}

      {/* Comments */}
      {stop.comments && (
        <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, marginTop: 4, paddingLeft: 32, fontStyle: 'italic' }}>
          {stop.comments}
        </p>
      )}
    </div>
  )
}

function Detail({ typo, label, value }) {
  return (
    <span style={{ ...typo.caption, color: TOKENS.colors.textMuted }}>
      <span style={{ color: TOKENS.colors.textLow }}>{label}: </span>
      <span style={{ fontWeight: 600, color: TOKENS.colors.textSoft }}>{value}</span>
    </span>
  )
}

function SummaryItem({ typo, label, value, color }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <p style={{ fontSize: 18, fontWeight: 700, color, margin: 0 }}>{value}</p>
      <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, marginTop: 2 }}>{label}</p>
    </div>
  )
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */

function isVisited(rs) {
  if (!rs) return false
  const s = String(rs).toLowerCase()
  return s.includes('visited') || s.includes('done') || s === 'completed'
}

function isNotVisited(rs) {
  if (!rs) return false
  const s = String(rs).toLowerCase()
  return s.includes('not_visited') || s === 'skipped' || s === 'not visited'
}

function getResultColor(rs) {
  if (!rs) return TOKENS.colors.warning
  const s = String(rs).toLowerCase()
  if (s.includes('not_visited') || s === 'skipped' || s === 'not visited') return TOKENS.colors.error
  if (s.includes('visited') || s.includes('done') || s === 'completed') return TOKENS.colors.success
  if (s.includes('progress')) return TOKENS.colors.blue2
  return TOKENS.colors.warning // pending
}

function getResultLabel(rs) {
  if (!rs) return 'Pendiente'
  const s = String(rs).toLowerCase()
  if (s.includes('not_visited') || s === 'not visited') return 'No visitado'
  if (s === 'skipped') return 'Omitido'
  if (s.includes('visited') || s.includes('done') || s === 'completed') return 'Visitado'
  if (s.includes('progress')) return 'En progreso'
  return 'Pendiente'
}

function resultToBadgeStatus(rs) {
  if (!rs) return 'pending'
  const s = String(rs).toLowerCase()
  if (s.includes('not_visited') || s === 'skipped' || s === 'not visited') return 'error'
  if (s.includes('visited') || s.includes('done') || s === 'completed') return 'done'
  if (s.includes('progress')) return 'in_progress'
  return 'pending'
}

function vendorStatusToBadge(status) {
  if (status === 'good') return 'done'
  if (status === 'warning') return 'pending'
  if (status === 'critical') return 'alert'
  return 'locked'
}

function vendorStatusLabel(status) {
  if (status === 'good') return 'Bien'
  if (status === 'warning') return 'Alerta'
  if (status === 'critical') return 'Critico'
  if (status === 'no_route') return 'Sin ruta'
  return status || '--'
}
