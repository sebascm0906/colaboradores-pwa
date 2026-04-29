import test from 'node:test'
import assert from 'node:assert/strict'

import {
  MAX_CHECKLIST_PHOTO_SIZE_BYTES,
  normalizeChecklistPhotoValue,
  validateChecklistPhotoFile,
} from '../src/modules/shared/checklistPhoto.js'

test('normalizeChecklistPhotoValue strips the data URL prefix', () => {
  assert.equal(
    normalizeChecklistPhotoValue('data:image/jpeg;base64,abc123=='),
    'abc123==',
  )
})

test('normalizeChecklistPhotoValue keeps raw base64 unchanged', () => {
  assert.equal(normalizeChecklistPhotoValue('abc123=='), 'abc123==')
})

test('validateChecklistPhotoFile accepts image files within the size limit', () => {
  assert.equal(
    validateChecklistPhotoFile({
      type: 'image/jpeg',
      size: MAX_CHECKLIST_PHOTO_SIZE_BYTES,
    }),
    '',
  )
})

test('validateChecklistPhotoFile rejects non-image files', () => {
  assert.equal(
    validateChecklistPhotoFile({
      type: 'application/pdf',
      size: 1024,
    }),
    'Solo se permiten imágenes.',
  )
})

test('validateChecklistPhotoFile rejects images that exceed the size limit', () => {
  assert.equal(
    validateChecklistPhotoFile({
      type: 'image/png',
      size: MAX_CHECKLIST_PHOTO_SIZE_BYTES + 1,
    }),
    'La foto debe ser menor a 2 MB.',
  )
})
