export const MAX_CHECKLIST_PHOTO_SIZE_BYTES = 2 * 1024 * 1024

export function normalizeChecklistPhotoValue(value) {
  if (typeof value !== 'string') return value
  if (!value.startsWith('data:')) return value
  return value.split(',', 2)[1] || ''
}

export function validateChecklistPhotoFile(file, options = {}) {
  const maxSizeBytes = Number(options.maxSizeBytes || MAX_CHECKLIST_PHOTO_SIZE_BYTES)
  const fileType = String(file?.type || '')
  const fileSize = Number(file?.size || 0)

  if (!fileType.startsWith('image/')) return 'Solo se permiten imágenes.'
  if (fileSize > maxSizeBytes) return `La foto debe ser menor a ${Math.round(maxSizeBytes / (1024 * 1024))} MB.`
  return ''
}

export function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('No se pudo leer la foto'))
    reader.readAsDataURL(file)
  })
}
