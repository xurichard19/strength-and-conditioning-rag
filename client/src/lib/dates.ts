export function toDateKey(date: Date) {
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part, index) => index ? String(part).padStart(2, '0') : part)
    .join('-')
}

export function formatDateKey(date: string, options: Intl.DateTimeFormatOptions) {
  const parsed = new Date(`${date}T00:00:00`)
  return Number.isNaN(parsed.getTime()) ? date : new Intl.DateTimeFormat(undefined, options).format(parsed)
}
