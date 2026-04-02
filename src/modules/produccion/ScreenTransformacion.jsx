import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TOKENS, getTypo } from '../../tokens'
import { getMyShift, getTransformationProducts, createTransformation } from './api'

// Productos de salida para transformación de barras
const FALLBACK_OUTPUT_PRODUCTS = [
  { id: 724, name: 'Barra Grande (75KG)', weight: 75 },
  { id: 725, name: 'Barra Chica (50KG)', weight: 50 },
  { id: 727, name: '1/2 Barra Grande (30KG)', weight: 35 },
  { id: 728, name: '1/2 Barra Chica (20KG)', weight: 25 },
  { id: 726, name: '1/4 Barra Grande (12KG)', weight: 15 },
]

export default function ScreenTransformacion() {
  const navigate = useNavigate()
  const [sw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])
  const [shift, setShift] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Formulario
  const [inputProduct, setInputProduct] = useState(724) // Barra Grande por default
  const [inputQty, setInputQty] = useState('')
  const [outputLines, setOutputLines] = useState([{ product_id: null, qty: '' }])
  const [scrapKg, setScrapKg] = useState('')
  const [outStart, setOutStart] = useState('')
  const [outEnd, setOutEnd] = useState('')
  const [roomTemp, setRoomTemp] = useState('')
  const [notes, setNotes] = useState('')

  useEffect(() => { loadShift() }, [])

  async function loadShift() {
    try {
      const s = await getMyShift()
      setShift(s)
    } catch { setError('Sin turno activo') }
    finally { setLoading(false) }
  }

  function nowTime() {
    return new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false })
  }

  function timeToDatetime(t) {
    if (!t) return null
    const [h, m] = t.split(':')
    const d = new Date()
    d.setHours(parseInt(h), parseInt(m), 0, 0)
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:00`
  }

  function addOutputLine() {
    setOutputLines(prev => [...prev, { product_id: null, qty: '' }])
  }

  function updateOutputLine(idx, field, value) {
    setOutputLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l))
  }

  function removeOutputLine(idx) {
    if (outputLines.length <= 1) return
    setOutputLines(prev => prev.filter((_, i) => i !== idx))
  }

  const inputKg = inputQty ? parseFloat(inputQty) * (FALLBACK_OUTPUT_PRODUCTS.find(p => p.id === inputProduct)?.weight || 75) : 0
  const outputKg = outputLines.reduce((sum, l) => {
    const prod = FALLBACK_OUTPUT_PRODUCTS.find(p => p.id === parseInt(l.product_id))
    return sum + (prod ? parseFloat(l.qty || 0) * prod.weight : 0)
  }, 0)

  async function handleSubmit() {
    if (!inputQty || !shift?.id) return
    setError('')
    setSaving(true)
    try {
      await createTransformation({
        shift_id: shift.id,
        input_product_id: inputProduct,
        input_qty: parseInt(inputQty),
        output_lines: outputLines.filter(l => l.product_id && l.qty).map(l => ({
          product_id: parseInt(l.product_id),
          qty: parseFloat(l.qty),
        })),
        scrap_kg: parseFloat(scrapKg) || 0,
        time_out_start: timeToDatetime(outStart),
        time_out_end: timeToDatetime(outEnd),
        room_temp: parseFloat(roomTemp) || 0,
        notes,
      })
      setSuccess('Transformación registrada')
      setInputQty('')
      setOutputLines([{ product_id: null, qty: '' }])
      setScrapKg('')
      setOutStart('')
      setOutEnd('')
      setRoomTemp('')
      setNotes('')
      setTimeout(() => navigate('/produccion'), 1500)
    } catch (e) {
      setError(e.message || 'Error al registrar')
    } finally { setSaving(false) }
  }

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
        input, textarea, select { font-family: 'DM Sans', sans-serif; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 16px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 20, paddingBottom: 16 }}>
          <button onClick={() => navigate('/produccion')} style={{
            width: 38, height: 38, borderRadius: TOKENS.radius.md,
            background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
            </svg>
          </button>
          <span style={{ ...typo.title, color: TOKENS.colors.textSoft }}>Transformación de Barras</span>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
            <div style={{ width: 32, height: 32, border: '2px solid rgba(255,255,255,0.12)', borderTop: '2px solid #2B8FE0', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Entrada */}
            <SectionLabel text="ENTRADA (BARRAS A FRACCIONAR)" typo={typo} />
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 2 }}>
                <label style={{ ...typo.caption, color: TOKENS.colors.textMuted, display: 'block', marginBottom: 6 }}>Producto</label>
                <select
                  value={inputProduct}
                  onChange={e => setInputProduct(parseInt(e.target.value))}
                  style={selectStyle}
                >
                  <option value={724}>Barra Grande (75KG)</option>
                  <option value={725}>Barra Chica (50KG)</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ ...typo.caption, color: TOKENS.colors.textMuted, display: 'block', marginBottom: 6 }}>Cantidad</label>
                <input type="number" inputMode="numeric" value={inputQty} onChange={e => setInputQty(e.target.value)}
                  placeholder="0" style={inputStyle} />
              </div>
            </div>
            {inputKg > 0 && (
              <p style={{ ...typo.body, color: TOKENS.colors.blue2, textAlign: 'center', margin: 0, fontWeight: 600 }}>
                Entrada: {inputKg.toFixed(0)} kg
              </p>
            )}

            {/* Salida */}
            <SectionLabel text="SALIDA (PRODUCTOS FRACCIONADOS)" typo={typo} />
            {outputLines.map((line, idx) => (
              <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <div style={{ flex: 2 }}>
                  {idx === 0 && <label style={{ ...typo.caption, color: TOKENS.colors.textMuted, display: 'block', marginBottom: 6 }}>Producto</label>}
                  <select value={line.product_id || ''} onChange={e => updateOutputLine(idx, 'product_id', e.target.value)} style={selectStyle}>
                    <option value="">Seleccionar...</option>
                    {FALLBACK_OUTPUT_PRODUCTS.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  {idx === 0 && <label style={{ ...typo.caption, color: TOKENS.colors.textMuted, display: 'block', marginBottom: 6 }}>Cant.</label>}
                  <input type="number" inputMode="numeric" value={line.qty} onChange={e => updateOutputLine(idx, 'qty', e.target.value)}
                    placeholder="0" style={inputStyle} />
                </div>
                {outputLines.length > 1 && (
                  <button onClick={() => removeOutputLine(idx)} style={{
                    width: 36, height: 42, borderRadius: TOKENS.radius.sm,
                    background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: TOKENS.colors.error, fontSize: 18, flexShrink: 0,
                  }}>×</button>
                )}
              </div>
            ))}
            <button onClick={addOutputLine} style={{
              padding: '10px', borderRadius: TOKENS.radius.sm,
              background: 'rgba(43,143,224,0.08)', border: '1px dashed rgba(43,143,224,0.3)',
              color: TOKENS.colors.blue2, fontSize: 13, fontWeight: 600, width: '100%',
            }}>
              + Agregar producto
            </button>
            {outputKg > 0 && (
              <p style={{ ...typo.body, color: TOKENS.colors.success, textAlign: 'center', margin: 0, fontWeight: 600 }}>
                Salida: {outputKg.toFixed(0)} kg
              </p>
            )}

            {/* Merma y tiempos */}
            <SectionLabel text="CONTROL DE PROCESO" typo={typo} />
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <label style={{ ...typo.caption, color: TOKENS.colors.textMuted, display: 'block', marginBottom: 6 }}>Merma (kg)</label>
                <input type="number" inputMode="decimal" value={scrapKg} onChange={e => setScrapKg(e.target.value)}
                  placeholder="0" style={inputStyle} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ ...typo.caption, color: TOKENS.colors.textMuted, display: 'block', marginBottom: 6 }}>Temp. ambiente °C</label>
                <input type="number" inputMode="decimal" value={roomTemp} onChange={e => setRoomTemp(e.target.value)}
                  placeholder="0" style={inputStyle} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <TimeField label="Salida congelador" value={outStart} onChange={setOutStart} onNow={() => setOutStart(nowTime())} typo={typo} />
              <TimeField label="Regreso congelador" value={outEnd} onChange={setOutEnd} onNow={() => setOutEnd(nowTime())} typo={typo} />
            </div>

            {/* Notas */}
            <div>
              <label style={{ ...typo.caption, color: TOKENS.colors.textMuted, display: 'block', marginBottom: 6 }}>Observaciones</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="Notas adicionales..."
                rows={2}
                style={{ ...inputStyle, resize: 'vertical', minHeight: 60 }} />
            </div>

            {/* Mensajes */}
            {error && <Msg type="error" text={error} />}
            {success && <Msg type="success" text={success} />}

            {/* Submit */}
            <button onClick={handleSubmit} disabled={!inputQty || saving}
              style={{
                width: '100%', padding: '14px', borderRadius: TOKENS.radius.lg,
                background: inputQty ? 'linear-gradient(90deg, #15499B, #2B8FE0)' : TOKENS.colors.surface,
                color: inputQty ? 'white' : TOKENS.colors.textLow,
                fontSize: 15, fontWeight: 600, opacity: saving ? 0.6 : 1,
                boxShadow: inputQty ? '0 10px 24px rgba(21,73,155,0.30)' : 'none',
                marginTop: 8,
              }}>
              {saving ? 'Guardando...' : 'Registrar Transformación'}
            </button>

            <div style={{ height: 24 }} />
          </div>
        )}
      </div>
    </div>
  )
}

const inputStyle = {
  width: '100%', padding: '10px 12px', borderRadius: 14,
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
  color: 'white', fontSize: 15, fontWeight: 600, outline: 'none',
}

const selectStyle = {
  ...inputStyle, appearance: 'none',
  backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'10\' height=\'6\' viewBox=\'0 0 10 6\' fill=\'none\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cpath d=\'M1 1L5 5L9 1\' stroke=\'rgba(255,255,255,0.4)\' stroke-width=\'1.5\' stroke-linecap=\'round\'/%3E%3C/svg%3E")',
  backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center',
  paddingRight: 32,
}

function SectionLabel({ text, typo }) {
  return <p style={{ ...typo.overline, color: TOKENS.colors.textLow, margin: 0, marginTop: 8 }}>{text}</p>
}

function TimeField({ label, value, onChange, onNow, typo }) {
  return (
    <div style={{ flex: 1 }}>
      <label style={{ ...typo.caption, color: TOKENS.colors.textMuted, display: 'block', marginBottom: 6 }}>{label}</label>
      <div style={{ display: 'flex', gap: 6 }}>
        <input type="time" value={value} onChange={e => onChange(e.target.value)}
          style={{ ...inputStyle, flex: 1 }} />
        <button onClick={onNow} style={{
          padding: '0 10px', borderRadius: 14,
          background: 'rgba(43,143,224,0.12)', border: '1px solid rgba(43,143,224,0.25)',
          color: TOKENS.colors.blue2, fontSize: 11, fontWeight: 700,
        }}>AHORA</button>
      </div>
    </div>
  )
}

function Msg({ type, text }) {
  const bg = type === 'error' ? 'rgba(239,68,68,0.08)' : 'rgba(34,197,94,0.08)'
  const border = type === 'error' ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.25)'
  const color = type === 'error' ? TOKENS.colors.error : TOKENS.colors.success
  return (
    <div style={{ padding: 12, borderRadius: 14, background: bg, border: `1px solid ${border}`, color, fontSize: 13, fontWeight: 500, textAlign: 'center' }}>
      {text}
    </div>
  )
}
