export const DEFAULT_EXPECTED_FREEZE_MIN = 25
export const DEFAULT_EXPECTED_DEFROST_MIN = 5

export function minutesFromFreezeHours(freezeHours, fallback = DEFAULT_EXPECTED_FREEZE_MIN) {
  const hours = Number(freezeHours)
  if (!Number.isFinite(hours) || hours <= 0) return fallback
  return Math.max(1, Math.round(hours * 60))
}

export function buildCycleExpectedTiming(machine, supportsExpectedFreezeField = false) {
  if (!supportsExpectedFreezeField) return {}
  return {
    expected_freeze_min: minutesFromFreezeHours(machine?.freeze_hours),
  }
}

export function withExpectedFreezeField(fields, supportsExpectedFreezeField = false) {
  if (!supportsExpectedFreezeField) return [...fields]
  return fields.includes('expected_freeze_min')
    ? [...fields]
    : [...fields, 'expected_freeze_min']
}
