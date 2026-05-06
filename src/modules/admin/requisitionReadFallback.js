function unwrapResult(payload) {
  if (payload && typeof payload === 'object' && payload.result !== undefined) {
    return unwrapResult(payload.result)
  }
  return payload
}

export function isFieldNotAllowedError(payload) {
  const result = unwrapResult(payload)
  if (!result || typeof result !== 'object') return false
  const code = String(result?.data?.code || result?.code || '')
  const status = Number(result?.status || 0)
  return code === 'field_not_allowed' || status === 403
}

export async function readWithOptionalFieldFallback(reader, model, {
  requiredFields = [],
  optionalFieldGroups = [],
  ...options
} = {}) {
  const groups = optionalFieldGroups
    .map((group) => Array.isArray(group) ? group.filter(Boolean) : [group].filter(Boolean))
    .filter((group) => group.length)

  let enabledGroups = groups.map((_, index) => index)
  let lastResult = null
  let lastFields = [...requiredFields]

  while (true) {
    const fields = [
      ...requiredFields,
      ...enabledGroups.flatMap((index) => groups[index]),
    ]
    lastFields = fields
    lastResult = await reader(model, { ...options, fields })
    if (!isFieldNotAllowedError(lastResult) || !enabledGroups.length) {
      return { result: lastResult, fields }
    }
    enabledGroups = enabledGroups.slice(0, -1)
  }
}
