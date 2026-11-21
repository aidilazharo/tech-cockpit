const myr = new Intl.NumberFormat('en-MY', {
  style: 'currency',
  currency: 'MYR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const DECIMAL = /^-?\d+(\.\d+)?$/

/**
 * Formats a MYR amount (API sends decimal strings). Returns null for null/undefined,
 * which the API uses for financial values the user may not see.
 */
export function formatMyr(amount: string | number | null | undefined): string | null {
  if (amount === null || amount === undefined) return null
  const text = String(amount)
  if (!DECIMAL.test(text)) throw new Error(`Invalid amount: ${text}`)
  return myr.format(Number(text))
}

const amount = new Intl.NumberFormat('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** A plain amount (no currency), e.g. costs in thousands of USD from ServiceNow. Null stays null (hidden). */
export function formatAmount(value: string | null): string | null {
  if (value === null) return null
  if (!DECIMAL.test(value)) throw new Error(`Invalid amount: ${value}`)
  return amount.format(Number(value))
}

// TechCockpit users are in Malaysia; show times in Malaysia time whatever the device says.
const TIME_ZONE = 'Asia/Kuala_Lumpur'
const dateFormat = new Intl.DateTimeFormat('en-MY', { day: 'numeric', month: 'short', year: 'numeric', timeZone: TIME_ZONE })
const dateTimeFormat = new Intl.DateTimeFormat('en-MY', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: TIME_ZONE,
})

/** "21 Oct 2026". Null for a missing date. */
export function formatDate(iso: string): string
export function formatDate(iso: string | null | undefined): string | null
export function formatDate(iso: string | null | undefined): string | null {
  return iso ? dateFormat.format(new Date(iso)) : null
}

/** "21 Oct 2026, 10:30 pm" (Malaysia time). Null for a missing date. */
export function formatDateTime(iso: string): string
export function formatDateTime(iso: string | null | undefined): string | null
export function formatDateTime(iso: string | null | undefined): string | null {
  return iso ? dateTimeFormat.format(new Date(iso)) : null
}
