export function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value)
}

/** Date -> "YYYY-MM-DD"(本地时区) */
export function toYmd(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

/** "YYYY-MM-DD" -> Date(本地零点) */
export function fromYmd(ymd: string): Date {
  const [year, month, day] = ymd.split('-').map(Number)
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1)
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

export function weekdayOf(ymd: string): number {
  return fromYmd(ymd).getDay()
}

export function addDays(ymd: string, delta: number): string {
  const date = fromYmd(ymd)
  date.setDate(date.getDate() + delta)
  return toYmd(date)
}

export function compareYmd(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

const WEEKDAY_NAMES = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']

export function weekdayName(ymd: string): string {
  return WEEKDAY_NAMES[weekdayOf(ymd)] ?? ''
}

/** 从午夜起的分钟数,含秒的小数 */
export function minutesSinceMidnight(date: Date): number {
  return date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60
}

/** 时间戳对应的当日分钟数(含秒的小数) */
export function minutesOfDay(timestamp: number): number {
  const date = new Date(timestamp)
  return minutesSinceMidnight(date)
}
