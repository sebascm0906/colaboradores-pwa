export const DEFAULT_EXPECTED_FREEZE_MIN = 25
export const DEFAULT_EXPECTED_DEFROST_MIN = 5

export function minutesFromFreezeHours(freezeHours, fallback = DEFAULT_EXPECTED_FREEZE_MIN) {
  const hours = Number(freezeHours)
  if (!Number.isFinite(hours) || hours <= 0) return fallback
  return Math.max(1, Math.round(hours * 60))
}

export function minutesFromMachineFreeze(machine, fallback = DEFAULT_EXPECTED_FREEZE_MIN) {
  const expectedMinutes = Number(machine?.expected_freeze_min)
  if (Number.isFinite(expectedMinutes) && expectedMinutes > 0) {
    return Math.max(1, Math.round(expectedMinutes))
  }
  return minutesFromFreezeHours(machine?.freeze_hours, fallback)
}

export function minutesFromMachineDefrost(machine, fallback = DEFAULT_EXPECTED_DEFROST_MIN) {
  const expectedMinutes = Number(machine?.expected_defrost_min)
  if (!Number.isFinite(expectedMinutes) || expectedMinutes <= 0) return fallback
  return Math.max(1, Math.round(expectedMinutes))
}

export function buildCycleExpectedTiming(machine, supportsExpectedFreezeField = false, supportsExpectedDefrostField = false) {
  const timing = {}
  if (supportsExpectedFreezeField) {
    timing.expected_freeze_min = minutesFromMachineFreeze(machine)
  }
  if (supportsExpectedDefrostField) {
    timing.expected_defrost_min = minutesFromMachineDefrost(machine)
  }
  return timing
}

export function withExpectedFreezeField(fields, supportsExpectedFreezeField = false) {
  if (!supportsExpectedFreezeField) return [...fields]
  return fields.includes('expected_freeze_min')
    ? [...fields]
    : [...fields, 'expected_freeze_min']
}

export function withExpectedTimingFields(fields, supportsExpectedFreezeField = false, supportsExpectedDefrostField = false) {
  let result = withExpectedFreezeField(fields, supportsExpectedFreezeField)
  if (!supportsExpectedDefrostField) return result
  return result.includes('expected_defrost_min')
    ? [...result]
    : [...result, 'expected_defrost_min']
}
