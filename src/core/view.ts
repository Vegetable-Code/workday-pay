import { daysInMonth, fromYmd, toYmd } from './dates'

export interface ViewState {
  /** 正在查看的年份 */
  year: number
  /** 正在查看的月份,1-12 */
  month: number
  /** 选中的日期 "YYYY-MM-DD" */
  selectedDate: string
}

const MIN_YEAR = 2000
const MAX_YEAR = 2100
const YMD_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** 未保存时的默认视图:当前月份 + 今天 */
export function defaultView(now: Date): ViewState {
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    selectedDate: toYmd(now),
  }
}

/** 把任意输入收敛成合法视图状态 */
export function sanitizeView(saved: unknown, now: Date): ViewState {
  const fallback = defaultView(now)
  if (!saved || typeof saved !== 'object') return fallback

  const raw = saved as Partial<ViewState>
  const year =
    typeof raw.year === 'number' &&
    Number.isInteger(raw.year) &&
    raw.year >= MIN_YEAR &&
    raw.year <= MAX_YEAR
      ? raw.year
      : fallback.year
  const month =
    typeof raw.month === 'number' &&
    Number.isInteger(raw.month) &&
    raw.month >= 1 &&
    raw.month <= 12
      ? raw.month
      : fallback.month

  return { year, month, selectedDate: clampSelectedDate(year, month, raw.selectedDate) }
}

/**
 * 选中日期必须落在正在查看的月份内。
 * 跨月时沿用原来的日号并收敛到该月(月末不足时取当月最后一天)。
 */
export function clampSelectedDate(year: number, month: number, ymd: string | undefined): string {
  const maxDay = daysInMonth(year, month)
  if (typeof ymd === 'string' && YMD_PATTERN.test(ymd)) {
    const date = fromYmd(ymd)
    if (date.getFullYear() === year && date.getMonth() + 1 === month) {
      return ymd
    }
    const day = Math.min(date.getDate(), maxDay)
    return toYmd(new Date(year, month - 1, day))
  }
  return toYmd(new Date(year, month - 1, 1))
}
