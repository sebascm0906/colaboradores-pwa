import { useEffect, useMemo, useState, useCallback } from 'react'
import { TOKENS, getTypo } from '../../tokens'
import { ScreenShell, EmptyState } from '../entregas/components'
import { getDayOverview, getRouteStops } from './supvService'

/* ============================================================================
   ScreenClientesSinVisitar — Unvisited clients across all vendors today
============================================================================ */

const VISITED_STATES = ['visited', 'done', 'completed']

function isVisited(resultStatus) {
  if (!resultStatus) return false
  return VISITED_STATES.includes(resultStatus.toLowerCase().trim())
}

export default function ScreenClientesSinVisitar() {
  const [sw, setSw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])

  const [loading, setLoading] = useState(true)
  const [loadingMsg, setLoadingMsg] = useState('Cargando equipo...')
  const [error, setError] = useState(null)
  const [vendorGroups, setVendorGroups] = useState([])
  const [totalScheduled, setTotalScheduled] = useState(0)
  const [totalUnvisited, setTotalUnvisited] = useState(0)
  const [expanded, setExpanded] = useState({})

  useEffect(() => {
    const h = () => setSw(window.innerWidth)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        setLoading(true)
        setLoadingMsg('Cargando equipo...')
        const overview = await getDayOverview()
        const withRoute = overview.vendors.filter((v) => v.has_route && v.route_id)

        if (cancelled) return
        if (withRoute.length === 0) {
          setVendorGroups([])
          setTotalScheduled(0)
          setTotalUnvisited(0)
          setLoading(false)
          return
        }

        // Load route stops in parallel
        const results = []
        for (let i = 0; i < withRoute.length; i++) {
          if (cancelled) return
          setLoadingMsg(`Cargando ruta ${i + 1} de ${withRoute.length}...`)
          const vendor = withRoute[i]
          try {
            const stops = await getRouteStops(vendor.route_id)
            results.push({ vendor, stops: Array.isArray(stops) ? stops : [] })
          } catch {
            results.push({ vendor, stops: [] })
          }
        }

        if (cancelled) return

        let scheduled = 0
        let unvisited = 0
        const groups = []

        for (const { vendor, stops } of results) {
          scheduled += stops.length
          const notVisited = stops.filter((s) => !isVisited(s.result_status))
          unvisited += notVisited.length
          if (notVisited.length > 0) {
            groups.push({
              vendor,
              stops: notVisited.sort((a, b) => (a.sequence || 0) - (b.sequence || 0)),
              totalStops: stops.length,
            })
          }
        }

        // Sort groups by unvisited count descending
        groups.sort((a, b) => b.stops.length - a.stops.length)

        setVendorGroups(groups)
        setTotalScheduled(scheduled)
        setTotalUnvisited(unvisited)
        setLoading(false)
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Error al cargar datos')
          setLoading(false)
        }
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const toggleExpand = useCallback((vendorId) => {
    setExpanded((prev) => ({ ...prev, [vendorId]: !prev[vendorId] }))
  }, [])

  // Loading state
  if (loading) {
    return (
      <ScreenShell title="Clientes sin visitar" backTo="/equipo">
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', padding: '80px 24px', gap: 16,
        }}>
          <div style={{
            width: 32, height: 32,
            border: `2px solid ${TOKENS.colors.border}`,
            borderTop: `2px solid ${TOKENS.colors.blue2}`,
            borderRadius: '50%',
            animation: 'sinVisitarSpin 0.8s linear infinite',
          }} />
          <style>{`@keyframes sinVisitarSpin { to { transform: rotate(360deg); } }`}</style>
          <span style={{ ...typo.body, color: TOKENS.colors.textMuted }}>{loadingMsg}</span>
        </div>
      </ScreenShell>
    )
  }

  // Error state
  if (error) {
    return (
      <ScreenShell title="Clientes sin visitar" backTo="/equipo">
        <EmptyState icon="!" title="Error" subtitle={error} typo={typo} />
      </ScreenShell>
    )
  }

  // All visited
  if (totalUnvisited === 0) {
    return (
      <ScreenShell title="Clientes sin visitar" backTo="/equipo">
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', padding: '60px 24px', textAlign: 'center',
        }}>
          <CheckIcon />
          <h3 style={{ ...typo.h2, color: TOKENS.colors.success, margin: '16px 0 6px' }}>
            Todos los clientes fueron visitados
          </h3>
          <p style={{ ...typo.body, color: TOKENS.colors.textMuted, margin: 0 }}>
            {totalScheduled > 0 ? `${totalScheduled} clientes programados, todos cubiertos` : 'No hay rutas programadas hoy'}
          </p>
        </div>
      </ScreenShell>
    )
  }

  const summaryColor = totalUnvisited > 10 ? TOKENS.colors.error : TOKENS.colors.warning

  return (
    <ScreenShell title="Clientes sin visitar" backTo="/equipo">
      {/* Summary header */}
      <div style={{
        background: TOKENS.glass.panel,
        border: `1px solid ${TOKENS.colors.border}`,
        borderRadius: TOKENS.radius.lg,
        padding: '20px 18px',
        marginBottom: 16,
        textAlign: 'center',
      }}>
        <div style={{
          ...typo.display,
          color: summaryColor,
          lineHeight: 1.1,
          marginBottom: 4,
        }}>
          {totalUnvisited}
        </div>
        <div style={{ ...typo.body, color: summaryColor, marginBottom: 2 }}>
          cliente{totalUnvisited !== 1 ? 's' : ''} sin visitar
        </div>
        <div style={{ ...typo.caption, color: TOKENS.colors.textMuted }}>
          de {totalScheduled} programados hoy
        </div>
      </div>

      {/* Vendor groups */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {vendorGroups.map(({ vendor, stops, totalStops }) => {
          const isOpen = expanded[vendor.id] !== false // default open
          return (
            <div key={vendor.id} style={{
              background: TOKENS.glass.panel,
              border: `1px solid ${TOKENS.colors.border}`,
              borderRadius: TOKENS.radius.md,
              overflow: 'hidden',
            }}>
              {/* Vendor header */}
              <button
                onClick={() => toggleExpand(vendor.id)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center',
                  gap: 10, padding: '12px 14px',
                  background: 'transparent', cursor: 'pointer',
                }}
              >
                <svg
                  width="14" height="14" viewBox="0 0 24 24" fill="none"
                  stroke={TOKENS.colors.textMuted} strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round"
                  style={{
                    transition: TOKENS.motion.fast, flexShrink: 0,
                    transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                  }}
                >
                  <path d="M9 18l6-6-6-6" />
                </svg>
                <span style={{
                  ...typo.body, color: TOKENS.colors.text, fontWeight: 600,
                  flex: 1, textAlign: 'left',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {vendor.name}
                </span>
                <span style={{
                  ...typo.caption, fontWeight: 700,
                  color: '#fff',
                  background: TOKENS.colors.error,
                  borderRadius: TOKENS.radius.pill,
                  padding: '2px 9px',
                  minWidth: 24, textAlign: 'center',
                }}>
                  {stops.length}
                </span>
              </button>

              {/* Stop list */}
              {isOpen && (
                <div style={{
                  borderTop: `1px solid ${TOKENS.colors.border}`,
                  padding: '4px 0',
                }}>
                  {stops.map((stop) => (
                    <div key={stop.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 14px 10px 38px',
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          ...typo.body, color: TOKENS.colors.textSoft,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {stop.customer || `Cliente #${stop.customer_id}`}
                        </div>
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 8, marginTop: 2,
                        }}>
                          <span style={{ ...typo.caption, color: TOKENS.colors.textMuted }}>
                            #{stop.sequence || '?'} de {totalStops}
                          </span>
                          {stop.not_visited_reason && (
                            <span style={{
                              ...typo.caption,
                              color: TOKENS.colors.warning,
                              background: TOKENS.colors.warningSoft,
                              borderRadius: TOKENS.radius.sm,
                              padding: '1px 7px',
                            }}>
                              {stop.not_visited_reason}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Call vendor about this client */}
                      {vendor.phone && (
                        <a
                          href={`tel:${vendor.phone}`}
                          style={{
                            width: 34, height: 34, flexShrink: 0,
                            borderRadius: TOKENS.radius.sm,
                            background: TOKENS.colors.surface,
                            border: `1px solid ${TOKENS.colors.border}`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            textDecoration: 'none',
                          }}
                          title={`Llamar a ${vendor.name}`}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                            stroke={TOKENS.colors.blue3} strokeWidth="2"
                            strokeLinecap="round" strokeLinejoin="round">
                            <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
                          </svg>
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </ScreenShell>
  )
}

/* Green checkmark for the empty/all-done state */
function CheckIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
      <circle cx="24" cy="24" r="22" fill={TOKENS.colors.successSoft} stroke={TOKENS.colors.success} strokeWidth="2" />
      <path d="M15 24l6 6 12-12" stroke={TOKENS.colors.success} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
