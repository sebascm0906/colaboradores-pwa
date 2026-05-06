import { safeNumber } from '../../lib/safeNumber.js'

function bucketTotal(buckets, key) {
  return safeNumber(buckets?.[key]?.total, { fallback: 0, precision: 2 })
}

export function buildLiquidacionViewModel(data = {}, overrides = {}) {
  const expectedBuckets = data.expected_payments || {}
  const hasExpectedBuckets = Boolean(data.expected_payments)
  const paymentBuckets = data.payments || {}
  const fallbackExpected = safeNumber(data.total_expected, { fallback: 0, precision: 2 })

  const cashExpected = hasExpectedBuckets ? bucketTotal(expectedBuckets, 'cash') : fallbackExpected
  const creditExpected = hasExpectedBuckets ? bucketTotal(expectedBuckets, 'credit') : 0
  const transferExpected = hasExpectedBuckets ? bucketTotal(expectedBuckets, 'transfer') : 0

  const cashCollected = overrides.cashCollected !== undefined
    ? safeNumber(overrides.cashCollected, { fallback: 0, precision: 2 })
    : bucketTotal(paymentBuckets, 'cash')
  const creditCollected = creditExpected
  const transferCollected = transferExpected || bucketTotal(paymentBuckets, 'transfer')

  const totalExpected = cashExpected + creditExpected + transferExpected
  const totalCollected = cashCollected + creditCollected + transferCollected

  return {
    cashExpected,
    creditExpected,
    transferExpected,
    cashCollected,
    creditCollected,
    transferCollected,
    cashDiff: cashCollected - cashExpected,
    creditDiff: creditCollected - creditExpected,
    transferDiff: transferCollected - transferExpected,
    totalExpected,
    totalCollected,
    totalDiff: totalCollected - totalExpected,
  }
}
