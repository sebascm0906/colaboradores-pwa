// ScreenMaterialesValidate.jsx — Inbox auxiliar admin · validar / rechazar / disputar
// ───────────────────────────────────────────────────────────────────────────
// POST /api/production/materials/settlement/list  (inbox por planta/turno)
// POST /api/production/materials/settlement/validate  (action: validate|reject|dispute)
// POST /api/production/materials/settlement/resolve_rejected  (desde pantalla dedicada)
//
// Un settlement en `rejected` ya no se puede re-validar: requiere resolución con
// desglose (qty_returned + qty_damaged + qty_consumed) en ScreenMaterialesResolverRejected.
// ───────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../App'
import { TOKENS, getTypo } from '../../tokens'
import {
  getPendingSettlements, validateMaterial,
  stateLabel, lineOf, colorForSeverity, colorForState,
} from '../almacen-pt/materialsService'
import { fmtNum, DEFAULT_WAREHOUSE_ID } from '../almacen-pt/ptService'
import { logScreenError } from '../shared/logScreenError'

// Validar materiales del almacenista es responsabilidad del GERENTE, no del auxiliar admin.
// Segregación de funciones: quien procesa gastos diarios no debe aprobar inventarios.
// Backend debe validar también.
const ALLOWED_ROLES = ['gerente_sucursal']
const INBOX_STATES = ['reported', 'disputed', 'rejected']

export default function ScreenMaterialesValidate() {
  const { session } = useSession()
  const navigate = useNavigate()
  const [sw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])
  const plantId = session?.warehouse_id || DEFAULT_WAREHOUSE_ID

  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [selected, setSelected] = useState(null)
  const [action, setAction] = useState('validate')
  const [notes, setNotes] = useState('')
  const submittingRef = useRef(false) // guard double-submit

  const role = session?.role || ''
  const allowed = ALLOWED_ROLES.includes(role)

  useEffect(() => {
    if (allowed) loadData()
    else setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed])

  async function loadData() {
    setLoading(true)
    setError('')
    try {
      const res = await getPendingSettlements({ plantId, states: INBOX_STATES })
      setItems(res.items || [])
    } catch (e) {
      logScreenError('ScreenMaterialesValidate', 'loadData', e)
      setError(e?.message || 'Error cargando settlements.')
    }
    setLoading(false)
  }

  const rejectedCount = useMemo(
    () => items.filter(it => (it.settlement_state || it.state) === 'rejected').length,
    [items]
  )

  function openSelected(it) {
    const state = it.settlement_state || it.state
    if (state === 'rejected') {
      // Rechazado no se valida: hay que resolverlo con desglose.
      navigate('/admin/materiales/resolver-rechazo', { state: { settlement: it } })
      return
    }
    setSelected(it)
    setAction('validate')
    setNotes('')
  }

  async function submit() {
    if (!selected || saving) return
    if (submittingRef.current) return // guard tick sincronico
    const settlementId = selected.settlement_id || selected.id || null
    const shiftId     = selected.shift_id || null
    const lineId      = selected.line_id  || null
    const materialId  = selected.material_id || null
    if (!settlementId && !(shiftId && lineId && materialId)) {
      setError('Settlement sin identificadores válidos.')
      return
    }
    submittingRef.current = true
    setSaving(true)
    setError('')
    try {
      await validateMaterial({
        settlementId,
        shiftId, lineId, materialId,
        action,
        employeeId: session?.employee_id || 0,
        notes: notes.trim(),
      })
      setMsg(action === 'validate'
        ? 'Validado.'
        : action === 'reject' ? 'Rechazado. Requiere resolución con desglose.'
        : 'Marcado en disputa.')
      setSelected(null); setAction('validate'); setNotes('')
      await loadData()
      setTimeout(() => setMsg(''), 2500)
    } catch (e) {
      logScreenError('ScreenMaterialesValidate', 'submit', e)
      setError(e?.message || 'Error en la validación.')
    } finally {
      submittingRef.current = false
      setSaving(false)
    }
  }

  if (!allowed) {
    return (
      <div style={pageStyle}>
        <GlobalStyles />
        <div style={{ maxWidth: 480, margin: '0 auto', padding: '40px 16px', textAlign: 'center' }}>
          <p style={{ ...typo.title, color: TOKENS.colors.error }}>Sin permiso</p>
          <p style={{ ...typo.body, color: TOKENS.colors.textMuted, marginTop: 8 }}>
            Esta pantalla es solo para auxiliar admin / gerente.
          </p>
          <button onClick={() => navigate('/admin')} style={{
            marginTop: 16, padding: '10px 20px', borderRadius: TOKENS.radius.pill,
            background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
            color: TOKENS.colors.text, fontSize: 13, fontWeight: 600,
          }}>Volver</button>
        </div>
      </div>
    )
  }

  return (
    <div style={pageStyle}>
      <GlobalStyles />
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 20, paddingBottom: 12 }}>
          <button onClick={() => navigate('/admin')} style={iconBtn}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
            </svg>
          </button>
          <div style={{ flex: 1 }}>
            <span style={{ ...typo.title, color: TOKENS.colors.textSoft }}>Validar materiales</span>
            <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, marginTop: 2 }}>
              Inbox planta · {items.length} pendiente{items.length === 1 ? '' : 's'}
            </p>
          </div>
          <button onClick={loadData} style={iconBtn}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 4v6h6"/><path d="M23 20v-6h-6"/><path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15"/>
            </svg>
          </button>
        </div>

        {error && <div style={errorBox}><p style={{ ...typo.caption, color: TOKENS.colors.error, margin: 0 }}>{error}</p></div>}
        {msg && <div style={successBox}><p style={{ ...typo.body, color: TOKENS.colors.success, margin: 0, fontWeight: 600 }}>{msg}</p></div>}

        {/* Banner de rechazados que requieren resolución manual */}
        {!selected && rejectedCount > 0 && (
          <button
            onClick={() => {
              const firstRej = items.find(it => (it.settlement_state || it.state) === 'rejected')
              if (firstRej) navigate('/admin/materiales/resolver-rechazo', { state: { settlement: firstRej } })
            }}
            style={{
              width: '100%', marginBottom: 12, padding: '12px 14px',
              borderRadius: TOKENS.radius.lg, textAlign: 'left',
              background: 'rgba(239,68,68,0.10)',
              border: `1px solid ${TOKENS.colors.error}`,
              display: 'flex', alignItems: 'center', gap: 12,
            }}
          >
            <div style={{
              width: 36, height: 36, borderRadius: TOKENS.radius.md,
              background: 'rgba(239,68,68,0.18)', border: `1px solid ${TOKENS.colors.error}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: TOKENS.colors.error, flexShrink: 0,
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ ...typo.body, color: TOKENS.colors.error, margin: 0, fontWeight: 700 }}>
                {rejectedCount} rechazado{rejectedCount === 1 ? '' : 's'} requiere{rejectedCount === 1 ? '' : 'n'} resolución
              </p>
              <p style={{ ...typo.caption, color: TOKENS.colors.textSoft, margin: 0, marginTop: 2 }}>
                Desglose final: devuelto + dañado + consumido = entregado
              </p>
            </div>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={TOKENS.colors.error} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
          </button>
        )}

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}>
            <div style={{ width: 32, height: 32, border: '2px solid rgba(255,255,255,0.12)', borderTop: '2px solid #2B8FE0', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : selected ? (
          <SelectedView
            selected={selected} action={action} setAction={setAction}
            notes={notes} setNotes={setNotes}
            submit={submit} saving={saving} onCancel={() => setSelected(null)}
            typo={typo}
          />
        ) : items.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: TOKENS.colors.textMuted, ...typo.body }}>
            Sin settlements pendientes en la planta.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
            {items.map(it => {
              const st = it.settlement_state || it.state
              const color = colorForState(st)
              return (
                <button key={it.id || it.settlement_id} onClick={() => openSelected(it)} style={rowStyle}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ ...typo.body, color: TOKENS.colors.text, margin: 0, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {it.product_name || it.material_name || '—'}
                    </p>
                    <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, marginTop: 2 }}>
                      {lineOf(it)}
                      {it.shift_id ? ` · Turno #${it.shift_id}` : ''}
                      {' · Entregado '}{fmtNum(it.qty_issued)}
                      {it.qty_remaining != null && <> · Sobr. {fmtNum(it.qty_remaining)}</>}
                    </p>
                  </div>
                  <span style={{
                    ...typo.caption,
                    padding: '3px 8px', borderRadius: TOKENS.radius.pill,
                    background: `${color}14`, color,
                    border: `1px solid ${color}40`,
                    fontWeight: 700, flexShrink: 0, marginLeft: 8,
                  }}>
                    {stateLabel(st)}
                  </span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
                </button>
              )
            })}
          </div>
        )}

        <div style={{ height: 32 }} />
      </div>
    </div>
  )
}

function SelectedView({ selected, action, setAction, notes, setNotes, submit, saving, onCancel, typo }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ padding: 14, borderRadius: TOKENS.radius.lg, background: TOKENS.glass.hero, border: `1px solid ${TOKENS.colors.borderBlue}` }}>
        <p style={{ ...typo.overline, color: TOKENS.colors.textLow, margin: 0 }}>
          {lineOf(selected)} · {stateLabel(selected.settlement_state || selected.state)}
          {selected.shift_id ? ` · Turno #${selected.shift_id}` : ''}
        </p>
        <p style={{ ...typo.title, color: TOKENS.colors.text, margin: 0, marginTop: 4 }}>
          {selected.product_name || selected.material_name || '—'}
        </p>
        <div style={{ display: 'flex', gap: 14, marginTop: 10 }}>
          <Stat label="Entregado" value={fmtNum(selected.qty_issued)} typo={typo} />
          <Stat label="Usado" value={fmtNum(selected.qty_used)} typo={typo} />
          <Stat label="Sobrante" value={fmtNum(selected.qty_remaining)} typo={typo} />
        </div>
        {selected.severity && (
          <div style={{ marginTop: 10 }}>
            <span style={{
              ...typo.caption,
              padding: '3px 8px', borderRadius: TOKENS.radius.pill,
              background: `${colorForSeverity(selected.severity)}14`,
              color: colorForSeverity(selected.severity),
              border: `1px solid ${colorForSeverity(selected.severity)}40`,
              fontWeight: 700,
            }}>
              {String(selected.severity).toUpperCase()}
            </span>
          </div>
        )}
        {selected.notes && (
          <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '10px 0 0', fontStyle: 'italic' }}>
            "{selected.notes}"
          </p>
        )}
      </div>

      <div>
        <p style={{ ...typo.caption, color: TOKENS.colors.text, margin: 0, marginBottom: 8, fontWeight: 700 }}>Acción</p>
        <div style={{ display: 'flex', gap: 6 }}>
          {[
            { v: 'validate', label: 'Validar', color: TOKENS.colors.success },
            { v: 'dispute',  label: 'Disputa', color: TOKENS.colors.warning },
            { v: 'reject',   label: 'Rechazar', color: TOKENS.colors.error },
          ].map(a => (
            <button key={a.v} onClick={() => setAction(a.v)} style={{
              flex: 1, padding: '10px', borderRadius: TOKENS.radius.md,
              background: action === a.v ? `${a.color}20` : TOKENS.colors.surfaceSoft,
              border: `1px solid ${action === a.v ? a.color : TOKENS.colors.border}`,
              color: action === a.v ? a.color : TOKENS.colors.textMuted,
              fontWeight: 700, fontSize: 13,
            }}>{a.label}</button>
          ))}
        </div>
        {action === 'reject' && (
          <p style={{ ...typo.caption, color: TOKENS.colors.warning, margin: '8px 0 0', fontWeight: 600 }}>
            Al rechazar se requerirá resolución manual con desglose.
          </p>
        )}
      </div>

      <div>
        <label style={{ ...typo.caption, color: TOKENS.colors.textMuted, display: 'block', marginBottom: 6 }}>
          Notas {action !== 'validate' ? '(recomendadas)' : '(opcional)'}
        </label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="Motivo..." rows={2}
          style={{ ...inputStyle, resize: 'vertical', minHeight: 56 }}
        />
      </div>

      <button onClick={submit} disabled={saving} style={{
        width: '100%', padding: '16px', borderRadius: TOKENS.radius.lg,
        background: 'linear-gradient(90deg, #15499B, #2B8FE0)',
        color: 'white', fontSize: 15, fontWeight: 700,
        opacity: saving ? 0.6 : 1, cursor: saving ? 'wait' : 'pointer',
        boxShadow: '0 10px 24px rgba(21,73,155,0.30)',
      }}>
        {saving ? 'Enviando...' : 'CONFIRMAR'}
      </button>
      <button onClick={onCancel} style={{
        padding: '10px', color: TOKENS.colors.textMuted, fontSize: 13, fontWeight: 600,
      }}>Cancelar</button>
    </div>
  )
}

function Stat({ label, value, typo }) {
  return (
    <div style={{ flex: 1 }}>
      <p style={{ ...typo.caption, color: TOKENS.colors.textLow, margin: 0 }}>{label}</p>
      <p style={{ ...typo.body, color: TOKENS.colors.textSoft, margin: 0, marginTop: 2, fontWeight: 700 }}>{value ?? '—'}</p>
    </div>
  )
}

const pageStyle = {
  minHeight: '100dvh',
  background: `linear-gradient(160deg, ${TOKENS.colors.bg0} 0%, ${TOKENS.colors.bg1} 50%, ${TOKENS.colors.bg2} 100%)`,
  paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)',
}
const errorBox = {
  padding: 10, borderRadius: TOKENS.radius.md, marginBottom: 12,
  background: TOKENS.colors.errorSoft, border: `1px solid ${TOKENS.colors.error}40`,
}
const successBox = {
  padding: 10, borderRadius: TOKENS.radius.md, marginBottom: 12,
  background: TOKENS.colors.successSoft, border: '1px solid rgba(34,197,94,0.25)',
  textAlign: 'center',
}
const inputStyle = {
  width: '100%', padding: '10px 12px', borderRadius: 14,
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
  color: 'white', fontSize: 15, fontWeight: 600, outline: 'none',
}
const iconBtn = {
  width: 38, height: 38, borderRadius: TOKENS.radius.md,
  background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
}
const rowStyle = {
  display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
  borderRadius: TOKENS.radius.md, textAlign: 'left', width: '100%',
  background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
}

function GlobalStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap');
      * { font-family: 'DM Sans', sans-serif; box-sizing: border-box; }
      button { border: none; background: none; cursor: pointer; }
      input, textarea { font-family: 'DM Sans', sans-serif; }
      @keyframes spin { to { transform: rotate(360deg); } }
    `}</style>
  )
}
