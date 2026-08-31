/** Shared formatters. Kept in one place so dates and money read identically everywhere. */

export const formatDate = (value, options = {}) => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...options,
  }).format(date)
}

export const formatTime = (value) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

/**
 * Currency comes from the employee's legal entity, never a global default -
 * a Saudi salary must never render with an AED symbol.
 */
export const formatMoney = (value, currency) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—'
  if (!currency) return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Number(value))
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(Number(value))
}

export const formatDays = (value) => {
  const days = Number(value ?? 0)
  const rounded = Number.isInteger(days) ? days : days.toFixed(1)
  return `${rounded} day${days === 1 ? '' : 's'}`
}

/**
 * Counted noun with the right ending: `plural(1, 'entity', 'entities')` gives
 * "1 entity". Irregular plurals take the third argument; regular ones just get
 * an "s". Half days count as plural ("0.5 working days"), which is how people
 * say it.
 */
export const plural = (count, singular, pluralForm) => {
  const n = Number(count ?? 0)
  const shown = Number.isInteger(n) ? n : n.toFixed(1)
  const word = n === 1 ? singular : (pluralForm ?? `${singular}s`)
  return `${shown} ${word}`
}

/** Coarse relative time for activity feeds - precision is not the point there. */
export const relativeTime = (value) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const diffMs = Date.now() - date.getTime()
  const minutes = Math.round(diffMs / 60000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} min ago`

  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`

  const days = Math.round(hours / 24)
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`

  return formatDate(value, { year: undefined })
}

/** Today as YYYY-MM-DD, for date input defaults and minimums. */
export const todayIso = () => new Date().toISOString().slice(0, 10)
