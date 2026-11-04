const currency = new Intl.NumberFormat('zh-CN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const compact = new Intl.NumberFormat('zh-CN', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

const hours = new Intl.NumberFormat('zh-CN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** 金额,保留两位小数 */
export function formatMoney(value: number): string {
  return currency.format(Number.isFinite(value) ? value : 0)
}

/** 工时,保留两位小数 */
export function formatHours(value: number): string {
  return hours.format(Number.isFinite(value) ? value : 0)
}

/** 整数金额,用于统计卡 */
export function formatAmount(value: number): string {
  return compact.format(Number.isFinite(value) ? value : 0)
}

/** 百分比,保留一位小数 */
export function formatPercent(ratio: number): string {
  const safe = Number.isFinite(ratio) ? ratio : 0
  return `${(safe * 100).toFixed(1)}%`
}

/** 时钟文本 HH:mm:ss */
export function formatClockTime(date: Date): string {
  const pad = (value: number) => (value < 10 ? `0${value}` : String(value))
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

/** 中文日期 11月3日 */
export function formatMonthDay(date: Date): string {
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

/** 年月 2026年11月 */
export function formatYearMonth(year: number, month: number): string {
  return `${year}年${month}月`
}
