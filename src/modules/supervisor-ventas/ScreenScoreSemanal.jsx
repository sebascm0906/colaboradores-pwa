import { useEffect, useMemo, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { TOKENS, getTypo } from '../../tokens'
import { ScreenShell } from '../entregas/components'
import { getWeeklyScore, getComplianceColor } from './supvService'

/* ============================================================================
   ScreenScoreSemanal — Weekly compliance grid (Mon-Sun) per vendor
============================================================================ */

const DAY_LABELS = ['L', 'M', 'Mi', 'J', 'V', 'S', 'D']

export default function ScreenScoreSemanal() {
  const navigate = useNavigate()
  const [sw, setSw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [data, setData] = useState(null)
  const [tooltip, setTooltip] = useState(null) // { vendorName, date, done, total, compliance, x, y }

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
        const result = await getWeeklyScore()
        if (!cancelled) {
          // Sort vendors by week_compliance ascending (worst first)
          result.vendorScores.sort((a, b) => a.week_compliance - b.week_compliance)
          setData(result)
          setLoading(false)
        }
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

  // Determine today's column index
  const todayStr = useMemo(() => {
    const d = new Date()
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  }, [])

  const todayIdx = useMemo(() => {
    if (!data) return -1
    return data.weekDays.indexOf(todayStr)
  }, [data, todayStr])

  const handleCellTap = useCallback((vendor, day, e) => {
    if (!day.has_route || day.compliance === null) return
    const rect = e.currentTarget.getBoundingClientRect()
    setTooltip({
      vendorName: vendor.name,
      date: day.date,
      done: day.stops_done,
      total: day.stops_total,
      compliance: day.compliance,
      x: rect.left + rect.width / 2,
      y: rect.top,
    })
  }, [])

  const closeTooltip = useCallback(() => setTooltip(null), [])

  // Team daily averages
  const teamDayAverages = useMemo(() => {
    if (!data) return []
    return data.weekDays.map((_, i) => {
      let totalStops = 0
      let doneStops = 0
      data.vendorScores.forEach((v) => {
        totalStops += v.days[i].stops_total
        doneStops += v.days[i].stops_done
      })
      return totalStops > 0 ? Math.round((doneStops / totalStops) * 100) : null
    })
  }, [data])

  const teamWeekAvg = useMemo(() => {
    if (!data || data.vendorScores.length === 0) return 0
    const totalStops = data.vendorScores.reduce((s, v) => s + v.total_stops, 0)
    const doneStops = data.vendorScores.reduce((s, v) => s + v.done_stops, 0)
    return totalStops > 0 ? Math.round((doneStops / totalStops) * 100) : 0
  }, [data])

  // Column widths
  const NAME_W = 80
  const CELL_W = 36
  const TOTAL_W = 46

  if (loading) {
    return (
      <ScreenShell title="Score Semanal" backTo="/equipo">
        <div style={{
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          padding: '80px 24px',
        }}>
          <div style={{
            width: 32, height: 32,
            border: `2px solid ${TOKENS.colors.border}`,
            borderTop: `2px solid ${TOKENS.colors.blue2}`,
            borderRadius: '50%',
            animation: 'scoreSpin 0.8s linear infinite',
          }} />
          <style>{`@keyframes scoreSpin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </ScreenShell>
    )
  }

  if (error) {
    return (
      <ScreenShell title="Score Semanal" backTo="/equipo">
        <div style={{
          padding: '60px 24px', textAlign: 'center',
        }}>
          <div style={{ ...typo.h2, color: TOKENS.colors.error, marginBottom: 8 }}>Error</div>
          <div style={{ ...typo.body, color: TOKENS.colors.textMuted }}>{error}</div>
        </div>
      </ScreenShell>
    )
  }

  if (!data || data.vendorScores.length === 0) {
    return (
      <ScreenShell title="Score Semanal" backTo="/equipo">
        <div style={{
          padding: '60px 24px', textAlign: 'center',
        }}>
          <div style={{ ...typo.h2, color: TOKENS.colors.textSoft, marginBottom: 8 }}>Sin datos</div>
          <div style={{ ...typo.body, color: TOKENS.colors.textMuted }}>No hay vendedores registrados</div>
        </div>
      </ScreenShell>
    )
  }

  return (
    <ScreenShell title="Score Semanal" backTo="/equipo">
      {/* Dismiss tooltip on background tap */}
      {tooltip && (
        <div
          onClick={closeTooltip}
          style={{ position: 'fixed', inset: 0, zIndex: 90 }}
        />
      )}

      {/* Scrollable grid */}
      <div style={{
        overflowX: 'auto', WebkitOverflowScrolling: 'touch',
        marginLeft: -4, marginRight: -4, paddingBottom: 8,
      }}>
        <div style={{ minWidth: NAME_W + CELL_W * 7 + TOTAL_W + 16 }}>

          {/* Header row */}
          <div style={{
            display: 'flex', alignItems: 'center',
            padding: '0 8px 8px',
            borderBottom: `1px solid ${TOKENS.colors.border}`,
          }}>
            <div style={{ width: NAME_W, flexShrink: 0 }} />
            {DAY_LABELS.map((label, i) => (
              <div key={i} style={{
                width: CELL_W, flexShrink: 0,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
              }}>
                {i === todayIdx && (
                  <div style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: TOKENS.colors.blue2,
                  }} />
                )}
                <span style={{
                  ...typo.caption, fontWeight: 600,
                  color: i === todayIdx ? TOKENS.colors.blue3 : TOKENS.colors.textMuted,
                }}>
                  {label}
                </span>
              </div>
            ))}
            <div style={{
              width: TOTAL_W, flexShrink: 0, textAlign: 'center',
            }}>
              <span style={{ ...typo.caption, fontWeight: 600, color: TOKENS.colors.textMuted }}>
                Sem
              </span>
            </div>
          </div>

          {/* Vendor rows */}
          {data.vendorScores.map((vendor) => (
            <div
              key={vendor.id}
              onClick={() => navigate(`/equipo/vendedor/${vendor.id}`)}
              style={{
                display: 'flex', alignItems: 'center',
                padding: '8px 8px',
                borderBottom: `1px solid ${TOKENS.colors.border}`,
                cursor: 'pointer',
                transition: TOKENS.motion.fast,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = TOKENS.colors.surfaceSoft
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
              }}
            >
              {/* Vendor name */}
              <div style={{
                width: NAME_W, flexShrink: 0, paddingRight: 6,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                ...typo.body, color: TOKENS.colors.textSoft, fontSize: 12,
              }}>
                {vendor.name.split(' ').slice(0, 2).join(' ')}
              </div>

              {/* Day cells */}
              {vendor.days.map((day, i) => (
                <div
                  key={day.date}
                  onClick={(e) => { e.stopPropagation(); handleCellTap(vendor, day, e) }}
                  style={{
                    width: CELL_W, flexShrink: 0,
                    display: 'flex', justifyContent: 'center', alignItems: 'center',
                    padding: '3px 0',
                    background: i === todayIdx ? 'rgba(43,143,224,0.06)' : 'transparent',
                    borderRadius: 4,
                  }}
                >
                  {!day.has_route ? (
                    <span style={{ ...typo.caption, color: TOKENS.colors.textMuted, opacity: 0.4 }}>
                      —
                    </span>
                  ) : day.compliance === null ? (
                    <div style={{
                      width: 26, height: 26, borderRadius: '50%',
                      border: `1.5px solid ${TOKENS.colors.border}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <span style={{ ...typo.caption, color: TOKENS.colors.textMuted, fontSize: 9 }}>
                        —
                      </span>
                    </div>
                  ) : (
                    <div style={{
                      width: 26, height: 26, borderRadius: '50%',
                      background: getComplianceColor(day.compliance),
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <span style={{
                        fontSize: 9, fontWeight: 700, color: '#fff',
                        lineHeight: 1,
                      }}>
                        {day.compliance}
                      </span>
                    </div>
                  )}
                </div>
              ))}

              {/* Week total */}
              <div style={{
                width: TOTAL_W, flexShrink: 0, textAlign: 'center',
              }}>
                <span style={{
                  ...typo.title, fontWeight: 700, fontSize: 13,
                  color: vendor.total_stops > 0 ? getComplianceColor(vendor.week_compliance) : TOKENS.colors.textMuted,
                }}>
                  {vendor.total_stops > 0 ? `${vendor.week_compliance}%` : '—'}
                </span>
              </div>
            </div>
          ))}

          {/* Footer — Team averages */}
          <div style={{
            display: 'flex', alignItems: 'center',
            padding: '10px 8px 4px',
            borderTop: `1px solid ${TOKENS.colors.borderBlue}`,
          }}>
            <div style={{
              width: NAME_W, flexShrink: 0, paddingRight: 6,
              ...typo.caption, fontWeight: 700,
              color: TOKENS.colors.blue3,
            }}>
              Equipo
            </div>

            {teamDayAverages.map((avg, i) => (
              <div key={i} style={{
                width: CELL_W, flexShrink: 0,
                display: 'flex', justifyContent: 'center', alignItems: 'center',
                background: i === todayIdx ? 'rgba(43,143,224,0.06)' : 'transparent',
                borderRadius: 4,
                padding: '3px 0',
              }}>
                {avg !== null ? (
                  <span style={{
                    ...typo.caption, fontWeight: 600, fontSize: 10,
                    color: getComplianceColor(avg),
                  }}>
                    {avg}%
                  </span>
                ) : (
                  <span style={{ ...typo.caption, color: TOKENS.colors.textMuted, opacity: 0.4 }}>—</span>
                )}
              </div>
            ))}

            <div style={{
              width: TOTAL_W, flexShrink: 0, textAlign: 'center',
            }}>
              <span style={{
                ...typo.title, fontWeight: 700, fontSize: 13,
                color: getComplianceColor(teamWeekAvg),
              }}>
                {teamWeekAvg}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Tooltip modal */}
      {tooltip && (
        <div style={{
          position: 'fixed', zIndex: 100,
          left: Math.min(Math.max(tooltip.x - 70, 8), sw - 156),
          top: tooltip.y - 72,
          width: 140,
          background: TOKENS.colors.bg1,
          border: `1px solid ${TOKENS.colors.borderBlue}`,
          borderRadius: TOKENS.radius.sm,
          padding: '10px 12px',
          boxShadow: TOKENS.shadow.md,
        }}>
          <div style={{ ...typo.caption, color: TOKENS.colors.textMuted, marginBottom: 4 }}>
            {tooltip.vendorName.split(' ').slice(0, 2).join(' ')}
          </div>
          <div style={{ ...typo.body, color: TOKENS.colors.text, fontWeight: 600, marginBottom: 2 }}>
            {tooltip.done}/{tooltip.total} paradas
          </div>
          <div style={{
            ...typo.caption, fontWeight: 700,
            color: getComplianceColor(tooltip.compliance),
          }}>
            {tooltip.compliance}% cumplimiento
          </div>
        </div>
      )}
    </ScreenShell>
  )
}
