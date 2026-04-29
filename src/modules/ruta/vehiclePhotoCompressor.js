// ─── vehiclePhotoCompressor — compresión cliente-side antes de submit ──────
// Comprime una foto a JPEG <500 KB típico antes de enviar como base64 al
// endpoint POST /pwa-ruta/vehicle-check (sin multipart, patrón Sebastián
// 2026-04-25 con fields.Binary(attachment=True)).
//
// Reglas:
//   - JPEG, calidad 0.75 (entre 75–85% según spec backend)
//   - Lado largo máximo 1920 px (config tope, baja a 1600/1280 si es muy grande)
//   - Output: { base64, filename, sizeBytes, mimeType }
//   - El base64 NO incluye prefijo "data:image/jpeg;base64,"
//
// El backend valida tamaño máximo (5 MB) y formato (JPEG/PNG). Si la PWA
// excede, devuelve code:'photo_too_large' o 'invalid_photo_format'.

const MAX_LONG_SIDE = 1920
const JPEG_QUALITY = 0.75
const TARGET_SIZE_BYTES = 500 * 1024  // 500 KB objetivo
const HARD_MAX_BYTES = 5 * 1024 * 1024  // 5 MB tope server-side

/**
 * Lee un File/Blob y devuelve un HTMLImageElement listo para canvas.
 * @param {File|Blob} file
 * @returns {Promise<HTMLImageElement>}
 */
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'))
    reader.onload = () => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('Formato de imagen no soportado'))
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}

/**
 * Calcula dimensiones manteniendo aspect ratio con lado largo máximo.
 * @param {number} w
 * @param {number} h
 * @param {number} maxSide
 * @returns {{width:number, height:number}}
 */
function fitDimensions(w, h, maxSide) {
  if (w <= maxSide && h <= maxSide) return { width: w, height: h }
  const scale = Math.min(maxSide / w, maxSide / h)
  return { width: Math.round(w * scale), height: Math.round(h * scale) }
}

/**
 * Devuelve base64 (sin prefijo data:) y metadata del JPEG comprimido.
 * Si el output supera TARGET_SIZE_BYTES, intenta una segunda pasada con
 * lado más chico (1600 → 1280 → 1024 px) para entrar en target.
 *
 * @param {File|Blob} file
 * @param {{maxLongSide?:number, quality?:number, filename?:string}} [opts]
 * @returns {Promise<{base64:string, filename:string, sizeBytes:number, mimeType:'image/jpeg', width:number, height:number}>}
 */
export async function compressPhotoToBase64(file, opts = {}) {
  if (!file) throw new Error('No hay archivo de imagen')
  if (file.size > HARD_MAX_BYTES * 4) {
    // Si la foto original supera 20 MB, ni siquiera intentamos cargarla en canvas
    // (Safari iOS puede crashear). Pedimos una foto más chica.
    throw new Error('La foto es demasiado grande. Toma una nueva foto.')
  }

  const filename = opts.filename || (file.name && file.name.replace(/\.[^.]+$/, '.jpg')) || 'check_photo.jpg'
  const quality = opts.quality ?? JPEG_QUALITY
  const initialMaxSide = opts.maxLongSide ?? MAX_LONG_SIDE
  const sideAttempts = [initialMaxSide, 1600, 1280, 1024, 800]

  const img = await loadImage(file)

  for (const maxSide of sideAttempts) {
    const { width, height } = fitDimensions(img.naturalWidth || img.width, img.naturalHeight || img.height, maxSide)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Tu dispositivo no soporta procesamiento de imagen')
    ctx.drawImage(img, 0, 0, width, height)
    const dataUrl = canvas.toDataURL('image/jpeg', quality)
    // dataUrl format: "data:image/jpeg;base64,XXXX"
    const base64 = dataUrl.split(',')[1] || ''
    if (!base64) throw new Error('No se pudo codificar la imagen')
    // Estimar tamaño en bytes (cada char base64 = 6 bits, /4*3)
    const sizeBytes = Math.round(base64.length * 0.75)
    if (sizeBytes <= TARGET_SIZE_BYTES || maxSide <= 800) {
      // Aceptamos si ya cabe en target O ya estamos en el lado más chico
      // (no podemos seguir reduciendo)
      return { base64, filename, sizeBytes, mimeType: 'image/jpeg', width, height }
    }
    // Si todavía no cabe, próxima iteración con lado más chico
  }

  // Fallback (no debería llegar): devolver el último intento sin checks
  throw new Error('No se pudo comprimir la imagen a un tamaño aceptable')
}

/**
 * Helper para usar desde input file. Devuelve null si el usuario canceló.
 * @param {Event} event
 * @returns {Promise<{base64,filename,sizeBytes,mimeType,width,height}|null>}
 */
export async function compressFromInputEvent(event) {
  const file = event?.target?.files?.[0]
  if (!file) return null
  return compressPhotoToBase64(file)
}
