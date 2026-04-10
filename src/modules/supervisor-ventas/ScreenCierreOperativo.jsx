import { useEffect, useMemo, useState } from 'react'
import { TOKENS, getTypo } from '../../tokens'
import { ScreenShell, StatusBadge, EmptyState } from '../entregas/components'
import { getDayOverview, getComplianceColor, fmtMoney, fmtTime, getLiquidationStatus } from './supvService'

/* ============================================================================
   ScreenCierreOperativo — Day Close Validation
   Shows all vendors with their closure/liquidation state so the supervisor
   can validate end-of-day: who has closed, who is liquidated, pending items.
============================================================================ */

export default function ScreenCierreOperativo() {
  const [sw, setSw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])

  const [data, setData] = useState(null)
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
      const res = await getDayOverview()
      setData(res)
    } catch (e) {
      if (e.message !== 'no_session') setError('Error al cargar datos')
    } finally {
      setLoading(false)
    }
  }

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

  if (loading) {
    return (
      <ScreenShell title="Cierre del Dia" backTo="/equipo" rightAction={refreshBtn}>
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
      <ScreenShell title="Cierre del Dia" backTo="/equipo" rightAction={refreshBtn}>
        <div style={{ margin: '12px 0', padding: 12, borderRadius: 10, background: TOKENS.colors.errorSoft, border: '1px solid rgba(239,68,68,0.2)' }}>
          <p style={{ ...typo.caption, color: TOKENS.colors.error, margin: 0 }}>{error}</p>
        </div>
      </ScreenShell>
    )
  }

  if (!data) {
    return (
      <ScreenShell title="Cierre del Dia" backTo="/equipo" rightAction={refreshBtn}>
        <EmptyState icon="📋" title="Sin datos" subtitle="No hay informacion disponible" typo={typo} />
      </ScreenShell>
    )
  }

  const { vendors = [], closed = 0, liquidated = 0, pending_liquidation = 0, with_route = 0 } = data
  const vendorsWithRoute = vendors.filter((v) => v.has_route)

  // Group by status
  const pendingClose = vendorsWithRoute.filter((v) => !v.is_closed)
  const closedNotLiq = vendorsWithRoute.filter((v) => v.is_closed && !v.is_liquidated)
  const fullyDone = vendorsWithRoute.filter((v) => v.is_liquidated)

  const allDone = pendingClose.length === 0 && closedNotLiq.length === 0

  return (
    <ScreenShell title="Cierre del Dia" backTo="/equipo" rightAction={refreshBtn}>

      {/* ── Summary strip ──────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 4 }}>
        <SummaryCard typo={typo} label="En ruta" value={with_route} sub={`${pendingClose.length} abiertos`} color={pendingClose.length > 0 ? TOKENS.colors.warning : TOKENS.colors.success} />
        <SummaryCard typo={typo} label="Cerrados" value={closed} sub={`${closedNotLiq.length} sin liquidar`} color={closedNotLiq.length > 0 ? '#f59e0b' : '#22c55e'} />
        <SummaryCard typo={typo} label="Liquidados" value={liquidated} sub={`de ${with_route}`} color="#22c55e" />
      </div>

      {/* All done banner */}
      {allDone && fullyDone.length > 0 && (
        <div style={{
          marginTop: 12, padding: '14px 16px', borderRadius: TOKENS.radius.lg,
          background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          <span style={{ ...typo.body, color: '#22c55e', fontWeight: 600 }}>
            Todos liquidados — dia completo
          </span>
        </div>
      )}

      {/* ── Section: Pending close (still in route) ───────────────────── */}
      {pendingClose.length > 0 && (
        <>
          <p style={{ ...typo.overline, color: TOKENS.colors.error, marginTop: 20, marginBottom: 10 }}>
            EN RUTA — SIN CERRAR ({pendingClose.length})
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pendingClose.map((v) => (
              <CloseRow key={v.id} v={v} typo={typo} />
            ))}
          </div>
        </>
      )}

      {/* ── Section: Closed but not liquidated ────────────────────────── */}
      {closedNotLiq.length > 0 && (
        <>
          <p style={{ ...typo.overline, color: TOKENS.colors.warning, marginTop: 20, marginBottom: 10 }}>
            CERRADOS — PENDIENTE LIQUIDAR ({closedNotLiq.length})
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {closedNotLiq.map((v) => (
              <CloseRow key={v.id} v={v} typo={typo} />
            ))}
          </div>
        </>
      )}

      {/* ── Section: Fully done ───────────────────────────────────────── */}
      {fullyDone.length > 0 && (
        <>
          <p style={{ ...typo.overline, color: TOKENS.colors.success, marginTop: 20, marginBottom: 10 }}>
            LIQUIDADOS ({fullyDone.length})
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {fullyDone.map((v) => (
              <CloseRow key={v.id} v={v} typo={typo} />
            ))}
          </div>
        </>
      )}

      {/* ── No route vendors ──────────────────────────────────────────── */}
      {vendors.filter((v) => !v.has_route).length > 0 && (
        <>
          <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginTop: 20, marginBottom: 10 }}>
            SIN RUTA ({vendors.filter((v) => !v.has_route).length})
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {vendors.filter((v) => !v.has_route).map((v) => (
              <span key={v.id} style={{
                ...typo.caption, color: TOKENS.colors.textMuted,
                padding: '4px 10px', borderRadius: TOKENS.radius.pill,
                background: 'rgba(255,255,255,0.06)',
                border: `1px solid ${TOKENS.colors.border}`,
              }}>
                {v.name}
              </span>
            ))}
          </div>
        </>
      )}

      <div style={{ height: 24 }} />
    </ScreenShell>
  )
}

/* ── Sub-components ──────────────────────────────────────────────────────── */

function SummaryCard({ typo, label, value, sub, color }) {
  return (
    <div style={{
      padding: '12px 8px', borderRadius: TOKENS.radius.lg,
      background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
      textAlign: 'center',
    }}>
      <p style={{ ...typo.overline, color: TOKENS.colors.textMuted, margin: 0, marginBottom: 4, fontSize: 9 }}>
        {label.toUpperCase()}
      </p>
      <p style={{ fontSize: 20, fontWeight: 700, color, margin: 0, letterSpacing: '-0.02em' }}>
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

function CloseRow({ v, typo }) {
  const compColor = getComplianceColor(v.compliance)
  const liqStatus = getLiquidationStatus(v)

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '12px 14px', borderRadius: TOKENS.radius.lg,
      background: TOKENS.glass.panel,
      border: `1px solid ${TOKENS.colors.border}`,
      borderLeft: `3px solid ${liqStatus.color}`,
    }}>
      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ ...typo.body, color: TOKENS.colors.text, margin: 0, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {v.name}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
          <span style={{ ...typo.caption, color: TOKENS.colors.textMuted }}>
            {v.stops_done}/{v.stops_total} visitas
          </span>
          <span style={{ ...typo.caption, color: TOKENS.colors.textMuted }}>
            {fmtMoney(v.sales_actual)}
          </span>
          {v.closure_time && (
            <span style={{ ...typo.caption, color: TOKENS.colors.textSoft, fontWeight: 600 }}>
              Cierre: {fmtTime(v.closure_time)}
            </span>
          )}
          {v.departure_real && (
            <span style={{ ...typo.caption, color: TOKENS.colors.textMuted }}>
              Salida: {fmtTime(v.departure_real)}
            </span>
          )}
        </div>

        {/* Force close reason */}
        {v.force_close_reason && (
          <p style={{ ...typo.caption, color: TOKENS.colors.error, margin: 0, marginTop: 4, fontSize: 10 }}>
            Forzado: {v.force_close_reason}
          </p>
        )}
      </div>

      {/* Compliance */}
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <p style={{ fontSize: 15, fontWeight: 700, color: compColor, margin: 0 }}>
          {v.compliance}%
        </p>
        <StatusBadge
          status={v.is_liquidated ? 'done' : v.is_closed ? 'pending' : 'in_progress'}
          label={liqStatus.label}
        />
      </div>
    </div>
  )
}
