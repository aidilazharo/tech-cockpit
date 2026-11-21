// Calendar dates (no time) as 'YYYY-MM-DD', in Malaysia time. TechCockpit users are in
// Malaysia; Malaysia has no daylight saving, so the offset is always +08:00.

const OFFSET = '+08:00'
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const DAY_MS = 86_400_000

const todayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit' })

/** Today's date in Malaysia. */
export function todayMy(now = new Date()): string {
  return todayFormat.format(now)
}

/** Whether 'YYYY-MM-DD' is a real calendar date (no 31 February). */
export function isValidIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value)
  if (!match) return false
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  return date.toISOString().slice(0, 10) === value
}

/** 00:00 Malaysia time on that day, as an ISO instant (e.g. a role's start). */
export function startOfDayMy(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00${OFFSET}`).toISOString()
}

/** 00:00 Malaysia time on the following day: the exclusive end of an inclusive "last day". */
export function endOfDayMy(isoDate: string): string {
  return new Date(new Date(`${isoDate}T00:00:00${OFFSET}`).getTime() + DAY_MS).toISOString()
}

/** The last day (Malaysia) covered by an exclusive end instant. */
export function lastDayMy(endInstant: string): string {
  return todayMy(new Date(Date.parse(endInstant) - 1))
}

/** 'YYYY-MM-DD' → 'DD/MM/YYYY' (Qi date format). */
export function toDisplayDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-')
  return `${day}/${month}/${year}`
}

/**
 * Typed text → 'YYYY-MM-DD', or null if it is not a date. Accepts DD/MM/YYYY with any
 * separator or none (Qi: never require special characters).
 */
export function parseDisplayDate(text: string): string | null {
  const digits = text.replace(/\D/g, '')
  if (digits.length !== 8) return null
  const iso = `${digits.slice(4)}-${digits.slice(2, 4)}-${digits.slice(0, 2)}`
  return isValidIsoDate(iso) ? iso : null
}

/** Input mask: digits become DD/MM/YYYY as they are typed. */
export function maskDisplayDate(text: string): string {
  const digits = text.replace(/\D/g, '').slice(0, 8)
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)].filter(Boolean).join('/')
}

/** Local Date at midnight for a calendar date (for the calendar grid). */
export function toCalendarDate(isoDate: string): Date {
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Date(year, month - 1, day)
}

/** Calendar grid Date → 'YYYY-MM-DD'. */
export function fromCalendarDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
