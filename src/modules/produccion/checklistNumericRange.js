export function normalizeChecklistNumericRange({ min_value, max_value } = {}) {
  const min = Number(min_value)
  const max = Number(max_value)
  if (!Number.isFinite(min) || !Number.isFinite(max) || max >= min) {
    return {
      min_value: Number.isFinite(min) ? min : min_value,
      max_value: Number.isFinite(max) ? max : max_value,
      wasInverted: false,
    }
  }

  return {
    min_value: max,
    max_value: min,
    wasInverted: true,
  }
}

export function normalizeChecklistNumericCheck(check = {}) {
  if (String(check?.check_type || '') !== 'numeric') return { ...check }
  const range = normalizeChecklistNumericRange(check)
  return {
    ...check,
    min_value: range.min_value,
    max_value: range.max_value,
    ...(range.wasInverted ? { _range_was_inverted: true } : {}),
  }
}
