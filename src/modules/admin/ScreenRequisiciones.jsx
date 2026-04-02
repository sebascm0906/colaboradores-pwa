import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../App'
import { TOKENS, getTypo, getCompaniesForSucursal } from '../../tokens'
import { createRequisition, getRequisitions } from './api'

export default function ScreenRequisiciones() {
  const { session } = useSession()
  const navigate = useNavigate()
  const [sw, setSw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])

  const [requisitions, setRequisitions] = useState([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const companies = useMemo(() => getCompaniesForSucursal(session?.sucursal), [session?.sucursal])

  // Form state
  const [companyId, setCompanyId] = useState(session?.company_id || companies[0]?.id || 34)
  const [title, setTitle] = useState('')
  const [lines, setLines] = useState([{ product_name: '', qty: 1 }])
  const [notes, setNotes] = useState('')

  useEffect(() => {
    const handler = () => setSw(window.innerWidth)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  useEffect(() => { loadRequisitions() }, [])

  async function loadRequisitions() {
    setLoading(true)
    try {
      const data = await getRequisitions()
      setRequisitions(Array.isArray(data) ? data : [])
    } catch { /* silent */ }
    finally { setLoading(false) }
  }

  function addLine() {
    setLines(prev => [...prev, { product_name: '', qty: 1 }])
  }

  function updateLine(index, field, value) {
    setLines(prev => prev.map((l, i) => i === index ? { ...l, [field]: value } : l))
  }

  function removeLine(index) {
    if (lines.length <= 1) return
    setLines(prev => prev.filter((_, i) => i !== index))
  }

  async function handleSubmit() {
    if (!title.trim()) { setError('Ingresa un titulo'); return }
    const validLines = lines.filter(l => l.product_name.trim())
    if (validLines.length === 0) { setError('Agrega al menos un producto'); return }
    setSubmitting(true)
    setError('')
    setSuccess('')
    try {
      await createRequisition({
        name: title.trim(),
        description: notes.trim(),
        company_id: companyId,
        sucursal: session?.sucursal || '',
        capturista: session?.name || '',
        lines: validLines.map(l => ({ product_name: l.product_name.trim(), qty: Number(l.qty) || 1 })),
      })
      setSuccess('Requisicion creada')
      setTitle('')
      setLines([{ product_name: '', qty: 1 }])
      setNotes('')
      await loadRequisitions()
      setTimeout(() => setSuccess(''), 3000)
    } catch (e) {
      setError(e.message || 'Error al crear requisicion')
    } finally { setSubmitting(false) }
  }

  const STATUS_MAP = {
    draft: { label: 'Borrador', color: TOKENS.colors.textMuted, bg: TOKENS.colors.surface },
    confirmed: { label: 'Confirmado', color: TOKENS.colors.blue3, bg: `${TOKENS.colors.blue2}18` },
    done: { label: 'Completado', color: TOKENS.colors.success, bg: TOKENS.colors.successSoft },
    cancel: { label: 'Cancelado', color: TOKENS.colors.error, bg: TOKENS.colors.errorSoft },
  }

  const inputStyle = {
    width: '100%', padding: '10px 14px', borderRadius: TOKENS.radius.md,
    background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
    color: TOKENS.colors.text, fontSize: typo.body.fontSize, outline: 'none',
    fontFamily: "'DM Sans', sans-serif",
  }

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
        input, textarea { font-family: 'DM Sans', sans-serif; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 16px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 20, paddingBottom: 12 }}>
          <button onClick={() => navigate('/admin')} style={{
            width: 38, height: 38, borderRadius: TOKENS.radius.md,
            background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
            </svg>
          </button>
          <span style={{ ...typo.title, color: TOKENS.colors.textSoft }}>Requisiciones</span>
        </div>

        {error && (
          <div style={{ padding: '10px 14px', borderRadius: TOKENS.radius.sm, background: TOKENS.colors.errorSoft, border: `1px solid ${TOKENS.colors.error}40`, marginBottom: 12 }}>
            <span style={{ ...typo.caption, color: TOKENS.colors.error }}>{error}</span>
          </div>
        )}
        {success && (
          <div style={{ padding: '10px 14px', borderRadius: TOKENS.radius.sm, background: TOKENS.colors.successSoft, border: `1px solid ${TOKENS.colors.success}40`, marginBottom: 12 }}>
            <span style={{ ...typo.caption, color: TOKENS.colors.success }}>{success}</span>
          </div>
        )}

        {/* Form */}
        <div style={{
          padding: 18, borderRadius: TOKENS.radius.xl,
          background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
          marginBottom: 20,
        }}>
          <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginTop: 0, marginBottom: 14 }}>NUEVA REQUISICION</p>

          <label style={{ ...typo.caption, color: TOKENS.colors.textMuted, display: 'block', marginBottom: 4 }}>Empresa *</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
            {companies.map(co => (
              <button key={co.id} onClick={() => setCompanyId(co.id)} style={{
                padding: '8px 14px', borderRadius: TOKENS.radius.pill,
                background: companyId === co.id ? `${TOKENS.colors.blue2}22` : TOKENS.colors.surface,
                border: `1px solid ${companyId === co.id ? TOKENS.colors.blue2 : TOKENS.colors.border}`,
                color: companyId === co.id ? TOKENS.colors.blue3 : TOKENS.colors.textMuted,
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}>
                {co.name}
              </button>
            ))}
          </div>

          <label style={{ ...typo.caption, color: TOKENS.colors.textMuted, display: 'block', marginBottom: 4 }}>Titulo / Descripcion *</label>
          <input type="text" placeholder="Ej: Material de limpieza" value={title} onChange={e => setTitle(e.target.value)} style={{ ...inputStyle, marginBottom: 14 }} />

          <label style={{ ...typo.caption, color: TOKENS.colors.textMuted, display: 'block', marginBottom: 8 }}>Productos necesarios</label>

          {lines.map((line, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
              <input type="text" placeholder="Nombre del producto" value={line.product_name}
                onChange={e => updateLine(i, 'product_name', e.target.value)}
                style={{ ...inputStyle, flex: 1 }}
              />
              <input type="number" min="1" value={line.qty}
                onChange={e => updateLine(i, 'qty', e.target.value)}
                style={{ ...inputStyle, width: 70, textAlign: 'center', padding: '10px 6px' }}
              />
              {lines.length > 1 && (
                <button onClick={() => removeLine(i)} style={{
                  width: 30, height: 30, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: TOKENS.colors.error,
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              )}
            </div>
          ))}

          <button onClick={addLine} style={{
            width: '100%', padding: '8px 0', borderRadius: TOKENS.radius.md,
            background: `${TOKENS.colors.blue2}12`, border: `1px dashed ${TOKENS.colors.blue2}40`,
            marginBottom: 14,
          }}>
            <span style={{ ...typo.caption, color: TOKENS.colors.blue3, fontWeight: 600 }}>+ Agregar producto</span>
          </button>

          <label style={{ ...typo.caption, color: TOKENS.colors.textMuted, display: 'block', marginBottom: 4 }}>Notas (opcional)</label>
          <textarea placeholder="Detalles adicionales..." rows={3} value={notes} onChange={e => setNotes(e.target.value)}
            style={{ ...inputStyle, resize: 'vertical', marginBottom: 14 }}
          />

          <button onClick={handleSubmit} disabled={submitting} style={{
            width: '100%', padding: '14px 0', borderRadius: TOKENS.radius.md,
            background: `linear-gradient(135deg, ${TOKENS.colors.blue}, ${TOKENS.colors.blue2})`,
            opacity: submitting ? 0.6 : 1,
          }}>
            {submitting ? (
              <div style={{ width: 18, height: 18, border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid white', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
            ) : (
              <span style={{ ...typo.body, color: 'white', fontWeight: 700 }}>Crear Requisicion</span>
            )}
          </button>
        </div>

        {/* Requisitions List */}
        <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginBottom: 10 }}>REQUISICIONES RECIENTES</p>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 30 }}>
            <div style={{ width: 24, height: 24, border: '2px solid rgba(255,255,255,0.12)', borderTop: '2px solid #2B8FE0', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : requisitions.length === 0 ? (
          <div style={{
            padding: '24px 20px', borderRadius: TOKENS.radius.lg, textAlign: 'center',
            background: TOKENS.glass.panelSoft, border: `1px solid ${TOKENS.colors.border}`,
          }}>
            <p style={{ ...typo.body, color: TOKENS.colors.textMuted, margin: 0 }}>Sin requisiciones</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 30 }}>
            {requisitions.map((req, i) => {
              const st = STATUS_MAP[req.state] || STATUS_MAP.draft
              return (
                <div key={req.id || i} style={{
                  padding: '12px 14px', borderRadius: TOKENS.radius.md,
                  background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
                  display: 'flex', alignItems: 'center', gap: 10,
                }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ ...typo.caption, color: TOKENS.colors.text, margin: 0, fontWeight: 600 }}>{req.name || 'Requisicion'}</p>
                    <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, marginTop: 2 }}>
                      {req.date ? new Date(req.date).toLocaleDateString('es-MX') : ''}
                    </p>
                  </div>
                  <div style={{
                    padding: '3px 8px', borderRadius: TOKENS.radius.pill,
                    background: st.bg,
                  }}>
                    <span style={{ fontSize: 10, fontWeight: 600, color: st.color }}>{st.label}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div style={{ height: 20 }} />
      </div>
    </div>
  )
}
