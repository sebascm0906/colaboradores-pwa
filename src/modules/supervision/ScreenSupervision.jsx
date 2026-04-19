import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../App'
import { TOKENS, getTypo, TURNO_LABELS } from '../../tokens'
import { getActiveShift } from './api'
import { resolveSupervisionWarehouseId } from './shiftContext'
import { listTanks } from '../produccion/barraService'
import { loadShiftReadiness } from '../shared/shiftReadiness'
import { logScreenError } from '../shared/logScreenError'

// Hub de Supervisor — backend-first.
//
// Autoridad: _get_close_readiness (Odoo) via loadShiftReadiness(shiftId).
// NO calcula estados. NO infiere pills. Consume:
//   - readiness.blockers[] (código estable + mensaje)
//   - readiness.warnings[]
//   - summary.{total_kg_produced, total_kg_packed, total_scrap_kg,
//              open_downtimes, open_cycles, balance_pct, compliance_score,
//              balance_blocker_threshold_pct, balance_warning_threshold_pct}
//
// Cada blocker/warning enruta al screen donde se corrige (BLOCKER_ROUTE).
// Sin mapa → no hay botón y se muestra como informativo (no se inventa ruta).

const BLOCKER_ROUTE = {
  energy_end: { route: '/supervision/energia', label: 'Ir a energía' },
  energy_start: { route: '/supervision/energia', label: 'Ir a energía' },
  open_downtime: { route: '/supervision/paros', label: 'Ir a paros' },
  open_cycles: { route: '/supervision/turno', label: 'Ir a turno' },
  balance: { route: '/supervision/merma', label: 'Revisar merma' },
  shift_state: { route: '/supervision/turno', label: 'Ir a turno' },
  haccp: { route: '/produccion/checklist', label: 'Ir a checklist' },
  checklist: { route: '/produccion/checklist', label: 'Ir a checklist' },
}

const STATUS_COLORS = {
  ok: TOKENS.colors.success,
  warning: TOKENS.colors.warning,
  alerta: TOKENS.colors.error,
  info: TOKENS.colors.textMuted,
}

export default function ScreenSupervision() {
  const { session } = useSession()
  const navigate = useNavigate()
  const [sw, setSw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])
  const supervisionWarehouseId = resolveSupervisionWarehouseId(session)
  const [shift, setShift] = useState(null)
  const [readiness, setReadiness] = useState(null) // { canClose, blockers, warnings }
  const [summary, setSummary] = useState({})
  const [tanks, setTanks] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const h = () => setSw(window.innerWidth)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [s, tanksRes] = await Promise.all([
        getActiveShift(supervisionWarehouseId).catch((e) => { logScreenError('ScreenSupervision', 'getActiveShift', e); return null }),
        listTanks().catch(() => ({ tanks: [] })),
      ])
      setShift(s)
      setTanks(tanksRes?.tanks || [])
      if (s?.id) {
        const r = await loadShiftReadiness(s.id)
        setReadiness(r.readiness)
        setSummary(r.summary || {})
      } else {
        setReadiness(null)
        setSummary({})
      }
    } catch (e) {
      logScreenError('ScreenSupervision', 'loadData', e)
    } finally {
      setLoading(false)
    }
  }

  // Derivados 100% desde backend. Nada se infiere.
  const blockers = readiness?.blockers || []
  const warnings = readiness?.warnings || []
  const canClose = !!readiness?.canClose
  const hasProblems = blockers.length > 0

  return (
    <div style={{
      minHeight: '100dvh',
      background: `linear-gradient(160deg, ${TOKENS.colors.bg0} 0%, ${TOKENS.colors.bg1} 50%, ${TOKENS.colors.bg2} 100%)`,
      paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap');
        * { font-family: 'DM Sans', sans-serif; box-sizing: border-box; }
        button { border: none; background: none; cursor: pointer; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 16px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 20, paddingBottom: 12 }}>
          <button onClick={() => navigate('/')} aria-label="Volver" style={{
            width: 38, height: 38, borderRadius: TOKENS.radius.md,
            background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
          </button>
          <span style={{ ...typo.title, color: TOKENS.colors.textSoft }}>Supervisión de Producción</span>
          <button onClick={loadData} aria-label="Refrescar" style={{
            marginLeft: 'auto', width: 32, height: 32, borderRadius: TOKENS.radius.md,
            background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"/><path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14"/></svg>
          </button>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
            <div style={{ width: 32, height: 32, border: '2px solid rgba(255,255,255,0.12)', borderTop: '2px solid #2B8FE0', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : !shift ? (
          <EmptyShift typo={typo} onOpen={() => navigate('/supervision/turno')} />
        ) : (
          <>
            {/* Banner de estado — la decisión viene del backend */}
            <StatusBanner
              shift={shift}
              blockers={blockers}
              warnings={warnings}
              canClose={canClose}
              typo={typo}
              onClose={() => navigate('/supervision/turno')}
            />

            {/* KPIs — todos leídos del summary del backend; null → — */}
            <KpiPanel shift={shift} summary={summary} typo={typo} />

            {/* Blockers accionables — uno por uno, con ruta directa */}
            {hasProblems && (
              <Section title="Pendientes para cerrar turno" typo={typo}>
                {blockers.map((b, i) => (
                  <IssueRow
                    key={`b-${i}`}
                    level="alerta"
                    code={b.code}
                    message={b.message}
                    typo={typo}
                    onGo={BLOCKER_ROUTE[b.code] ? () => navigate(BLOCKER_ROUTE[b.code].route) : null}
                    goLabel={BLOCKER_ROUTE[b.code]?.label}
                  />
                ))}
              </Section>
            )}

            {warnings.length > 0 && (
              <Section title="Avisos" typo={typo}>
                {warnings.map((w, i) => (
                  <IssueRow
                    key={`w-${i}`}
                    level="warning"
                    code={w.code}
                    message={w.message}
                    typo={typo}
                    onGo={BLOCKER_ROUTE[w.code] ? () => navigate(BLOCKER_ROUTE[w.code].route) : null}
                    goLabel={BLOCKER_ROUTE[w.code]?.label}
                  />
                ))}
              </Section>
            )}

            {/* Tanques — ya es backend-authoritative */}
            {tanks.length > 0 && (
              <div style={{ marginTop: 18 }}>
                <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginBottom: 10 }}>ESTADO DE BARRAS</p>
                {tanks.map(t => <TankRow key={t.id} t={t} typo={typo} onClick={() => navigate(`/produccion/tanque/${t.id}`)} />)}
              </div>
            )}

            {/* Navegación secundaria — acceso directo a cada screen */}
            <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginTop: 24, marginBottom: 12 }}>GESTIÓN</p>
            <NavGrid
              items={[
                { id: 'turno', label: 'Control de Turno', desc: stateLabel(shift.state), route: '/supervision/turno', color: TOKENS.colors.blue3 },
                { id: 'paros', label: 'Paros de Línea', desc: countBadge('paro', summary.open_downtimes), route: '/supervision/paros', color: TOKENS.colors.error },
                { id: 'energia', label: 'Energía', desc: energyLabel(summary.energy_kwh, shift.energy_kwh), route: '/supervision/energia', color: TOKENS.colors.blue2 },
                { id: 'merma', label: 'Merma', desc: mermaLabel(summary.total_scrap_kg, shift.total_scrap_kg), route: '/supervision/merma', color: TOKENS.colors.warning },
                { id: 'mantenimiento', label: 'Mantenimiento', desc: maintenanceLabel(shift.open_maintenance_requests), route: '/supervision/mantenimiento', color: '#a78bfa' },
              ]}
              typo={typo}
              onGo={(route) => navigate(route)}
            />
            <div style={{ height: 32 }} />
          </>
        )}
      </div>
    </div>
  )
}

// ─── helpers puros ─────────────────────────────────────────────────────────

function stateLabel(s) {
  return ({ draft: 'Borrador', in_progress: 'En curso', closed: 'Cerrado', cancelled: 'Cancelado' }[s] || s || '—')
}
function countBadge(noun, n) {
  if (n === undefined || n === null) return '—'
  if (n === 0) return `Sin ${noun}s abiertos`
  return `${n} ${noun}${n === 1 ? '' : 's'} abierto${n === 1 ? '' : 's'}`
}
function energyLabel(summaryVal, shiftVal) {
  const v = [summaryVal, shiftVal].find(x => x !== undefined && x !== null)
  if (v === undefined || v === null) return '—'
  return `${Number(v).toFixed(0)} kWh`
}
function maintenanceLabel(openCount) {
  // Autoridad: /api/production/dashboard.open_maintenance_requests
  // (close_date = False). Null/undefined → "—" (no hay dato backend),
  // 0 → "Sin solicitudes abiertas", N → "N abierta(s)".
  if (openCount === undefined || openCount === null) return '—'
  const n = Number(openCount) || 0
  if (n === 0) return 'Sin solicitudes abiertas'
  return `${n} abierta${n === 1 ? '' : 's'}`
}
function mermaLabel(summaryVal, shiftVal) {
  const v = [summaryVal, shiftVal].find(x => x !== undefined && x !== null)
  if (v === undefined || v === null) return '—'
  return `${Number(v).toFixed(1)} kg`
}

// ─── subcomponentes ────────────────────────────────────────────────────────

function EmptyShift({ typo, onOpen }) {
  return (
    <div style={{ marginTop: 40, padding: 24, borderRadius: TOKENS.radius.xl, background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`, textAlign: 'center' }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>&#x1F3ED;</div>
      <p style={{ ...typo.title, color: TOKENS.colors.text }}>Sin turno activo</p>
      <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, marginTop: 6 }}>Abre un turno para comenzar a registrar.</p>
      <button onClick={onOpen} style={{
        marginTop: 14, padding: '10px 20px', borderRadius: TOKENS.radius.sm,
        background: 'linear-gradient(135deg, #15499B 0%, #2B8FE0 100%)',
        color: 'white', fontSize: 13, fontWeight: 600,
      }}>Ir a Control de Turno</button>
    </div>
  )
}

function StatusBanner({ shift, blockers, warnings, canClose, typo, onClose }) {
  // Decisión de presentación basada únicamente en datos del backend.
  let tone = 'info', title = '', subtitle = '', cta = null
  if (shift.state === 'closed') {
    tone = 'ok'; title = 'Turno cerrado'; subtitle = 'Sin acciones operativas pendientes.'
  } else if (shift.state === 'draft') {
    tone = 'info'; title = 'Turno en borrador'; subtitle = 'Inícialo en Control de Turno.'
    cta = { label: 'Ir a turno', onClick: onClose }
  } else if (canClose) {
    tone = 'ok'; title = 'Listo para cerrar turno'; subtitle = 'Backend validó todas las condiciones.'
    cta = { label: 'Cerrar turno', onClick: onClose }
  } else if (blockers.length > 0) {
    tone = 'alerta'
    title = `${blockers.length} pendiente${blockers.length === 1 ? '' : 's'} para cerrar`
    subtitle = warnings.length > 0 ? `Además ${warnings.length} aviso${warnings.length === 1 ? '' : 's'}.` : 'Resuélvelos antes del cierre.'
  } else {
    tone = 'ok'; title = 'Operación sin pendientes detectados'; subtitle = 'Backend no reporta blockers.'
  }
  const color = STATUS_COLORS[tone]
  return (
    <div style={{
      marginTop: 8, padding: 16, borderRadius: TOKENS.radius.xl,
      background: `${color}10`, border: `1px solid ${color}40`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: color }} />
        <div style={{ flex: 1 }}>
          <p style={{ ...typo.overline, color: TOKENS.colors.textLow, margin: 0 }}>{shift.name || `Turno ${shift.shift_code}`}</p>
          <p style={{ ...typo.title, color: TOKENS.colors.text, margin: '2px 0 0' }}>{title}</p>
          <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '2px 0 0' }}>{subtitle}</p>
        </div>
        {cta && (
          <button onClick={cta.onClick} style={{
            padding: '8px 14px', borderRadius: TOKENS.radius.pill,
            background: color, color: 'white', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
          }}>{cta.label}</button>
        )}
      </div>
    </div>
  )
}

function KpiPanel({ shift, summary, typo }) {
  // Todo desde backend. Null explícito si no hay dato.
  const num = (v) => (v === undefined || v === null) ? null : Number(v)
  const fmt = (v, unit) => v === null ? '—' : `${v.toFixed(unit === 'kg' || unit === 'kWh' ? 0 : 1)} ${unit}`
  const produced = num(summary.total_kg_produced ?? shift.total_kg_produced)
  const packed = num(summary.total_kg_packed ?? shift.total_kg_packed)
  const scrap = num(summary.total_scrap_kg ?? shift.total_scrap_kg)
  const cycles = num(summary.cycles_completed ?? shift.x_cycles_completed)
  const openDt = num(summary.open_downtimes)
  const openCy = num(summary.open_cycles)
  const balance = num(summary.balance_pct)
  const score = num(summary.compliance_score ?? shift.x_compliance_score)
  return (
    <div style={{
      marginTop: 12, padding: 14, borderRadius: TOKENS.radius.xl,
      background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <p style={{ ...typo.overline, color: TOKENS.colors.textLow, margin: 0 }}>MÉTRICAS DEL TURNO</p>
        {score !== null && (
          <span style={{ padding: '2px 8px', borderRadius: TOKENS.radius.pill, background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)', fontSize: 11, fontWeight: 700, color: TOKENS.colors.success }}>Score {score.toFixed(0)}</span>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        <Kpi label="Producido" value={fmt(produced, 'kg')} typo={typo} />
        <Kpi label="Empacado" value={fmt(packed, 'kg')} typo={typo} />
        <Kpi label="Merma" value={fmt(scrap, 'kg')} typo={typo} />
        <Kpi label="Ciclos" value={cycles === null ? '—' : String(cycles)} typo={typo} />
        <Kpi label="Abiertos" value={openCy === null ? '—' : String(openCy)} warn={openCy > 0} typo={typo} />
        <Kpi label="Paros abr." value={openDt === null ? '—' : String(openDt)} warn={openDt > 0} typo={typo} />
      </div>
      {balance !== null && (
        <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: TOKENS.radius.sm, background: TOKENS.glass.panelSoft, border: `1px solid ${TOKENS.colors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ ...typo.caption, color: TOKENS.colors.textMuted }}>Desbalance</span>
          <span style={{ ...typo.caption, color: balance > (summary.balance_blocker_threshold_pct || 5) ? TOKENS.colors.error : balance > (summary.balance_warning_threshold_pct || 1) ? TOKENS.colors.warning : TOKENS.colors.success, fontWeight: 700 }}>
            {balance.toFixed(1)}%
          </span>
        </div>
      )}
    </div>
  )
}

function Kpi({ label, value, warn, typo }) {
  return (
    <div style={{ padding: '8px 6px', borderRadius: TOKENS.radius.sm, background: TOKENS.glass.panelSoft, border: `1px solid ${TOKENS.colors.border}`, textAlign: 'center' }}>
      <p style={{ fontSize: 9, fontWeight: 600, color: TOKENS.colors.textMuted, margin: 0, letterSpacing: '0.1em' }}>{label.toUpperCase()}</p>
      <p style={{ fontSize: 16, fontWeight: 700, color: warn ? TOKENS.colors.warning : TOKENS.colors.text, margin: '2px 0 0' }}>{value}</p>
    </div>
  )
}

function Section({ title, children, typo }) {
  return (
    <div style={{ marginTop: 16 }}>
      <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginBottom: 8 }}>{title.toUpperCase()}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>
    </div>
  )
}

function IssueRow({ level, code, message, onGo, goLabel, typo }) {
  const color = STATUS_COLORS[level] || TOKENS.colors.textMuted
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
      borderRadius: TOKENS.radius.sm, background: `${color}10`, border: `1px solid ${color}30`,
    }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ ...typo.caption, color: TOKENS.colors.textSoft, margin: 0, fontWeight: 600 }}>{message}</p>
        {code && <p style={{ fontSize: 9, color: TOKENS.colors.textMuted, margin: '2px 0 0', letterSpacing: '0.05em' }}>{code}</p>}
      </div>
      {onGo ? (
        <button onClick={onGo} style={{
          padding: '6px 12px', borderRadius: TOKENS.radius.pill,
          background: color, color: 'white', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
        }}>{goLabel || 'Ir a corregir'}</button>
      ) : (
        <span style={{ ...typo.caption, color: TOKENS.colors.textMuted, fontStyle: 'italic' }}>—</span>
      )}
    </div>
  )
}

function TankRow({ t, typo, onClick }) {
  const tempThr = t.min_brine_temp_for_harvest
  const saltThr = t.min_salt_level_for_harvest
  const saltUnit = t.salt_level_unit || 'ppm'
  const tempOk = tempThr != null && t.brine_temp && t.brine_temp <= tempThr
  const tempBad = tempThr != null && t.brine_temp && t.brine_temp > tempThr
  const saltMissing = !t.salt_level
  const saltBad = saltThr != null && !saltMissing && t.salt_level < saltThr
  const saltOk = saltThr == null || (!saltMissing && t.salt_level >= saltThr)
  const hasAlerts = tempBad || saltBad || saltMissing
  return (
    <button onClick={onClick} style={{
      padding: 14, borderRadius: TOKENS.radius.lg, textAlign: 'left',
      background: hasAlerts ? 'rgba(239,68,68,0.06)' : TOKENS.glass.panel,
      border: `1px solid ${hasAlerts ? 'rgba(239,68,68,0.25)' : TOKENS.colors.border}`,
      display: 'flex', flexDirection: 'column', gap: 8, width: '100%', marginBottom: 8,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <p style={{ ...typo.body, color: TOKENS.colors.text, margin: 0, fontWeight: 700 }}>{t.display_name || t.name}</p>
        <span style={{
          padding: '2px 8px', borderRadius: TOKENS.radius.pill, fontSize: 11, fontWeight: 700,
          background: (t.ready_slots_count || 0) > 0 ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.06)',
          color: (t.ready_slots_count || 0) > 0 ? TOKENS.colors.success : TOKENS.colors.textMuted,
          border: `1px solid ${(t.ready_slots_count || 0) > 0 ? 'rgba(34,197,94,0.25)' : 'transparent'}`,
        }}>{t.ready_slots_count || 0} listas</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
        <TankMini label="CANAST." value={t.total_slots || '—'} />
        <TankMini label="TEMP" value={t.brine_temp ? `${t.brine_temp}°C` : '—'} color={tempBad ? TOKENS.colors.error : tempOk ? TOKENS.colors.success : null} />
        <TankMini label="SAL" value={t.salt_level || '—'} color={saltOk ? TOKENS.colors.success : TOKENS.colors.warning} />
        <TankMini label="ÚLT. EXTR." value={t.last_extraction_time ? new Date(t.last_extraction_time).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '—'} color={TOKENS.colors.blue2} />
      </div>
      {hasAlerts && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
          <span style={{ fontSize: 12 }}>&#x26A0;</span>
          <span style={{ ...typo.caption, color: TOKENS.colors.error, fontWeight: 600 }}>
            {[
              tempBad ? `Temp ${t.brine_temp}°C > ${tempThr}°C` : null,
              saltMissing ? 'Sin lectura de sal' : null,
              saltBad ? `Sal ${t.salt_level} < ${saltThr} ${saltUnit}` : null,
            ].filter(Boolean).join(' · ')}
          </span>
        </div>
      )}
    </button>
  )
}

function TankMini({ label, value, color }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <p style={{ fontSize: 14, fontWeight: 800, color: color || TOKENS.colors.textMuted, margin: 0 }}>{value}</p>
      <p style={{ fontSize: 9, fontWeight: 600, color: TOKENS.colors.textMuted, margin: 0, marginTop: 2 }}>{label}</p>
    </div>
  )
}

function NavGrid({ items, typo, onGo }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.map(a => (
        <button key={a.id} onClick={() => onGo(a.route)} style={{
          display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: TOKENS.radius.lg,
          background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
          boxShadow: TOKENS.shadow.soft, width: '100%', textAlign: 'left', cursor: 'pointer',
        }}>
          <div style={{
            width: 42, height: 42, borderRadius: TOKENS.radius.md,
            background: `${a.color}14`, border: `1px solid ${a.color}30`, color: a.color,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontWeight: 800,
          }}>{a.label.charAt(0)}</div>
          <div style={{ flex: 1 }}>
            <p style={{ ...typo.title, color: TOKENS.colors.text, margin: 0 }}>{a.label}</p>
            <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '2px 0 0' }}>{a.desc}</p>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
        </button>
      ))}
    </div>
  )
}
