import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../App'
import { TOKENS, getTypo } from '../../tokens'
import { getActiveShift, getScraps, getScrapReasons, createScrap } from './api'

const LINES = [
  { id: 1, name: 'Iguala - Barras' },
  { id: 2, name: 'Iguala - Rolito' },
]

export default function ScreenMerma() {
  const { session } = useSession()
  const navigate = useNavigate()
  const [sw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])
  const [shift, setShift] = useState(null)
  const [scraps, setScraps] = useState([])
  const [reasons, setReasons] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({ kg: '', reason_id: '', line_id: '', notes: '' })
  const [photo, setPhoto] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const s = await getActiveShift()
      setShift(s)
      if (s?.id) {
        const [sc, rs] = await Promise.all([
          getScraps(s.id).catch(() => []),
          getScrapReasons().catch(() => []),
        ])
        setScraps(sc || [])
        setReasons(rs || [])
      }
    } catch { /* empty */ }
    finally { setLoading(false) }
  }

  async function handleCreate(e) {
    e.preventDefault()
    if (!formData.kg || !formData.reason_id || !formData.line_id) return
    setSubmitting(true)
    try {
      const payload = {
        shift_id: shift.id,
        kg: Number(formData.kg),
        reason_id: Number(formData.reason_id),
        line_id: Number(formData.line_id),
        notes: formData.notes,
      }
      if (photo) {
        const reader = new FileReader()
        const b64 = await new Promise((resolve) => { reader.onload = () => resolve(reader.result); reader.readAsDataURL(photo) })
        payload.photo_base64 = b64
      }
      await createScrap(payload)
      setMsg({ type: 'success', text: 'Merma registrada' })
      setShowForm(false)
      setFormData({ kg: '', reason_id: '', line_id: '', notes: '' })
      setPhoto(null)
      await loadData()
    } catch (err) { setMsg({ type: 'error', text: err.message || 'Error al registrar merma' }) }
    finally { setSubmitting(false) }
  }

  useEffect(() => { if (msg) { const t = setTimeout(() => setMsg(null), 3500); return () => clearTimeout(t) } }, [msg])

  const totalKg = scraps.reduce((s, sc) => s + (sc.kg || 0), 0)

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 20, paddingBottom: 16 }}>
          <button onClick={() => navigate('/supervision')} style={{
            width: 38, height: 38, borderRadius: TOKENS.radius.md,
            background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
            </svg>
          </button>
          <div style={{ flex: 1 }}>
            <span style={{ ...typo.title, color: TOKENS.colors.textSoft }}>Merma</span>
          </div>
          <span style={{ ...typo.caption, color: TOKENS.colors.textMuted }}>{totalKg.toFixed(1)} kg total</span>
        </div>

        {/* Msg */}
        {msg && (
          <div style={{
            marginBottom: 12, padding: '10px 14px', borderRadius: TOKENS.radius.md,
            background: msg.type === 'success' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
            border: `1px solid ${msg.type === 'success' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
          }}>
            <span style={{ ...typo.caption, color: msg.type === 'success' ? TOKENS.colors.success : TOKENS.colors.error }}>{msg.text}</span>
          </div>
        )}

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
            <div style={{ width: 32, height: 32, border: '2px solid rgba(255,255,255,0.12)', borderTop: '2px solid #2B8FE0', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : !shift ? (
          <div style={{ marginTop: 40, padding: 24, borderRadius: TOKENS.radius.xl, background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`, textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>&#x26A0;&#xFE0F;</div>
            <p style={{ ...typo.title, color: TOKENS.colors.warning }}>Sin turno activo</p>
            <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, marginTop: 6 }}>Abre un turno primero desde Control de Turno.</p>
          </div>
        ) : (
          <>
            {/* Registrar Merma */}
            {!showForm ? (
              <button onClick={() => setShowForm(true)} style={{
                width: '100%', padding: '12px', borderRadius: TOKENS.radius.md, marginBottom: 16,
                background: 'linear-gradient(135deg, #15499B 0%, #2B8FE0 100%)',
                color: 'white', fontSize: 14, fontWeight: 600,
              }}>
                + Registrar Merma
              </button>
            ) : (
              <form onSubmit={handleCreate} style={{
                padding: 16, borderRadius: TOKENS.radius.xl, marginBottom: 16,
                background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.borderBlue}`,
              }}>
                <p style={{ ...typo.title, color: TOKENS.colors.text, margin: '0 0 12px' }}>Registrar Merma</p>

                <label style={{ ...typo.caption, color: TOKENS.colors.textMuted, display: 'block', marginBottom: 4 }}>Kg</label>
                <input type="number" step="0.1" min="0" value={formData.kg} onChange={e => setFormData(p => ({ ...p, kg: e.target.value }))}
                  placeholder="0.0"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: TOKENS.radius.sm, background: 'rgba(255,255,255,0.05)', border: `1px solid ${TOKENS.colors.border}`, color: 'white', fontSize: 13, fontFamily: 'inherit', marginBottom: 10 }} />

                <label style={{ ...typo.caption, color: TOKENS.colors.textMuted, display: 'block', marginBottom: 4 }}>Motivo</label>
                <select value={formData.reason_id} onChange={e => setFormData(p => ({ ...p, reason_id: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: TOKENS.radius.sm, background: 'rgba(255,255,255,0.05)', border: `1px solid ${TOKENS.colors.border}`, color: 'white', fontSize: 13, fontFamily: 'inherit', marginBottom: 10 }}>
                  <option value="">Seleccionar...</option>
                  {reasons.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>

                <label style={{ ...typo.caption, color: TOKENS.colors.textMuted, display: 'block', marginBottom: 4 }}>Linea</label>
                <select value={formData.line_id} onChange={e => setFormData(p => ({ ...p, line_id: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: TOKENS.radius.sm, background: 'rgba(255,255,255,0.05)', border: `1px solid ${TOKENS.colors.border}`, color: 'white', fontSize: 13, fontFamily: 'inherit', marginBottom: 10 }}>
                  <option value="">Seleccionar...</option>
                  {LINES.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>

                <label style={{ ...typo.caption, color: TOKENS.colors.textMuted, display: 'block', marginBottom: 4 }}>Notas</label>
                <textarea value={formData.notes} onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))} rows={2}
                  placeholder="Notas adicionales..."
                  style={{ width: '100%', padding: '10px 12px', borderRadius: TOKENS.radius.sm, background: 'rgba(255,255,255,0.05)', border: `1px solid ${TOKENS.colors.border}`, color: 'white', fontSize: 13, fontFamily: 'inherit', resize: 'vertical', marginBottom: 10 }} />

                <label style={{ ...typo.caption, color: TOKENS.colors.textMuted, display: 'block', marginBottom: 4 }}>Foto</label>
                <input type="file" accept="image/*" capture="environment" onChange={e => setPhoto(e.target.files?.[0] || null)}
                  style={{ width: '100%', padding: '8px 0', color: TOKENS.colors.textMuted, fontSize: 13, marginBottom: 12 }} />
                {photo && <p style={{ ...typo.caption, color: TOKENS.colors.blue2, marginTop: -6, marginBottom: 10 }}>{photo.name}</p>}

                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={() => { setShowForm(false); setFormData({ kg: '', reason_id: '', line_id: '', notes: '' }); setPhoto(null) }}
                    style={{ flex: 1, padding: '10px', borderRadius: TOKENS.radius.sm, background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`, color: TOKENS.colors.textMuted, fontSize: 13, fontWeight: 600 }}>
                    Cancelar
                  </button>
                  <button type="submit" disabled={submitting || !formData.kg || !formData.reason_id || !formData.line_id}
                    style={{
                      flex: 2, padding: '10px', borderRadius: TOKENS.radius.sm, fontSize: 13, fontWeight: 600, color: 'white',
                      background: (!formData.kg || !formData.reason_id || !formData.line_id) ? TOKENS.colors.surface : 'linear-gradient(135deg, #15499B 0%, #2B8FE0 100%)',
                      border: `1px solid ${(!formData.kg || !formData.reason_id || !formData.line_id) ? TOKENS.colors.border : 'transparent'}`,
                      opacity: submitting ? 0.6 : 1,
                    }}>
                    {submitting ? 'Registrando...' : 'Registrar Merma'}
                  </button>
                </div>
              </form>
            )}

            {/* Lista de mermas */}
            {scraps.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {scraps.map(sc => (
                  <div key={sc.id} style={{
                    padding: 14, borderRadius: TOKENS.radius.xl,
                    background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
                    boxShadow: TOKENS.shadow.soft,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <p style={{ ...typo.title, color: TOKENS.colors.text, margin: 0 }}>{sc.product || sc.reason || 'Merma'}</p>
                        <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, marginTop: 4 }}>
                          {sc.line_name || ''} {sc.created_at ? `\u00B7 ${sc.created_at}` : ''}
                        </p>
                      </div>
                      <div style={{ padding: '4px 10px', borderRadius: TOKENS.radius.pill, background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: TOKENS.colors.warning }}>{sc.kg || 0} kg</span>
                      </div>
                    </div>
                    {sc.notes && <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '8px 0 0' }}>{sc.notes}</p>}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ marginTop: 20, padding: 24, borderRadius: TOKENS.radius.xl, background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)', textAlign: 'center' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>&#x2705;</div>
                <p style={{ ...typo.title, color: TOKENS.colors.success }}>Sin merma</p>
                <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, marginTop: 6 }}>No se ha registrado merma en este turno.</p>
              </div>
            )}
          </>
        )}
        <div style={{ height: 32 }} />
      </div>
    </div>
  )
}
