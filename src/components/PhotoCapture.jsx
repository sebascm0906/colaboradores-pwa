// ─── PhotoCapture — componente placeholder para adjuntar evidencia fotográfica
// Funcional hoy (lee File → base64 en memoria), pero preparado para
// integrarse con endpoint de backend cuando Sebastián lo exponga.
//
// Uso:
//   <PhotoCapture
//     value={photoBase64}
//     onChange={setPhotoBase64}
//     label="Foto del producto dañado"
//     required
//   />
//
// IMPORTANTE: hoy solo guarda el base64 localmente. Cuando se agregue el
// endpoint POST /pwa/evidence/upload, este componente llamará ahí y
// devolverá { attachment_id, url } en lugar de base64 inline.

import { useRef, useState } from 'react'
import { TOKENS } from '../tokens'

export default function PhotoCapture({
  value,
  onChange,
  label = 'Adjuntar foto',
  required = false,
  maxSizeKB = 2048, // 2MB default
  disabled = false,
}) {
  const inputRef = useRef(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return

    setError('')

    // Validación tamaño
    if (file.size > maxSizeKB * 1024) {
      setError(`La foto debe ser menor a ${maxSizeKB / 1024}MB`)
      e.target.value = ''
      return
    }

    // Validación tipo
    if (!file.type.startsWith('image/')) {
      setError('Solo se permiten imágenes')
      e.target.value = ''
      return
    }

    setLoading(true)
    try {
      const base64 = await fileToBase64(file)
      onChange?.(base64)
      // TODO(backend): POST /pwa/evidence/upload {file: base64} → devolver attachment_id
    } catch (err) {
      setError('No se pudo procesar la foto')
    } finally {
      setLoading(false)
      e.target.value = ''
    }
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => reject(new Error('FileReader error'))
      reader.readAsDataURL(file)
    })
  }

  function clearPhoto() {
    onChange?.(null)
    setError('')
  }

  const hasPhoto = !!value

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {label && (
        <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: TOKENS.colors.textLow, textTransform: 'uppercase' }}>
          {label} {required && <span style={{ color: TOKENS.colors.error }}>*</span>}
        </label>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFile}
        disabled={disabled || loading}
        style={{ display: 'none' }}
      />

      {hasPhoto ? (
        <div style={{
          position: 'relative',
          borderRadius: TOKENS.radius.md,
          overflow: 'hidden',
          border: `1px solid ${TOKENS.colors.border}`,
        }}>
          <img
            src={value}
            alt="Evidencia"
            style={{ width: '100%', height: 160, objectFit: 'cover', display: 'block' }}
          />
          <button
            type="button"
            onClick={clearPhoto}
            disabled={disabled}
            style={{
              position: 'absolute', top: 8, right: 8,
              width: 32, height: 32, borderRadius: '50%',
              background: 'rgba(0,0,0,0.65)', border: 'none', color: 'white',
              fontSize: 14, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >✕</button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || loading}
          style={{
            padding: '20px 16px',
            borderRadius: TOKENS.radius.md,
            background: TOKENS.colors.surface,
            border: `1px dashed ${TOKENS.colors.border}`,
            color: TOKENS.colors.textMuted,
            fontSize: 13, fontWeight: 500,
            cursor: disabled ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            opacity: disabled ? 0.5 : 1,
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          <span style={{ fontSize: 18 }}>{loading ? '⏳' : '📷'}</span>
          <span>{loading ? 'Procesando...' : 'Tomar foto / Seleccionar'}</span>
        </button>
      )}

      {error && (
        <p style={{ color: TOKENS.colors.error, fontSize: 12, margin: 0 }}>{error}</p>
      )}
    </div>
  )
}
