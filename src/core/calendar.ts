import type { DayInfo, DayKind, HolidayData, HolidayYear, Weekday } from './types'
import { daysInMonth, fromYmd, toYmd, weekdayName } from './dates'

const EMPTY_YEAR: HolidayYear = { holidays: {}, workdays: {}, inLieu: {} }

/** 默认排班:周一至周五上班(双休) */
export const DEFAULT_WORK_DAYS: Weekday[] = [1, 2, 3, 4, 5]

export function yearData(data: HolidayData, year: number): HolidayYear {
  return data[String(year)] ?? EMPTY_YEAR
}

/**
 * 判断某天是否需要上班(只按国家放假安排,不考虑用户排班)。
 * 规则与 chinese-days 一致:调休补班日上班;周一至周五且非法定假期才上班。
 */
export function isWorkday(date: string, data: HolidayData): boolean {
  const year = Number(date.slice(0, 4))
  const { holidays, workdays } = yearData(data, year)
  if (workdays[date]) return true
  const weekday = fromYmd(date).getDay()
  if (weekday === 0 || weekday === 6) return false
  return !holidays[date]
}

export interface DayStatus {
  kind: DayKind
  name: string
  isWorkday: boolean
}

/**
 * 某天的性质。
 *
 * 优先级:
 * 1. 调休补班 → 上班(按国家安排)
 * 2. 法定假日 / 调休放假 → 休息(按国家安排)
 * 3. 其余日子 → 按用户填的每周排班(workDays)决定上班还是休息
 */
export function dayStatus(
  date: string,
  data: HolidayData,
  workDays: Weekday[] = DEFAULT_WORK_DAYS,
): DayStatus {
  const year = Number(date.slice(0, 4))
  const { holidays, workdays, inLieu } = yearData(data, year)

  if (workdays[date]) {
    return { kind: 'makeup', name: `${workdays[date]}调休上班`, isWorkday: true }
  }
  if (holidays[date]) {
    if (inLieu[date]) {
      return { kind: 'inLieu', name: `${holidays[date]}调休`, isWorkday: false }
    }
    return { kind: 'statutory', name: holidays[date]!, isWorkday: false }
  }
  const weekday = fromYmd(date).getDay() as Weekday
  if (!workDays.includes(weekday)) {
    const weekend = weekday === 0 || weekday === 6
    return {
      kind: weekend ? 'weekend' : 'off',
      name: weekend ? '休息日' : '按排班休息',
      isWorkday: false,
    }
  }
  return { kind: 'workday', name: weekdayName(date), isWorkday: true }
}

export function describeDay(
  date: string,
  data: HolidayData,
  startDate = '',
  workDays: Weekday[] = DEFAULT_WORK_DAYS,
): DayInfo {
  if (startDate && date < startDate) {
    return { date, kind: 'notStarted', name: '未入职', isWorkday: false }
  }
  return { date, ...dayStatus(date, data, workDays) }
}

/** 某月逐日信息 */
export function monthDays(
  year: number,
  month: number,
  data: HolidayData,
  startDate = '',
  workDays: Weekday[] = DEFAULT_WORK_DAYS,
): DayInfo[] {
  const total = daysInMonth(year, month)
  const days: DayInfo[] = []
  for (let day = 1; day <= total; day += 1) {
    const date = toYmd(new Date(year, month - 1, day))
    days.push(describeDay(date, data, startDate, workDays))
  }
  return days
}

/** 某月需要上班的日期列表 */
export function monthWorkdays(
  year: number,
  month: number,
  data: HolidayData,
  startDate = '',
  workDays: Weekday[] = DEFAULT_WORK_DAYS,
): string[] {
  return monthDays(year, month, data, startDate, workDays)
    .filter((day) => day.isWorkday)
    .map((day) => day.date)
}

export function dayKindLabel(kind: DayKind): string {
  switch (kind) {
    case 'workday':
      return '上班'
    case 'makeup':
      return '调休上班'
    case 'statutory':
      return '法定假日'
    case 'inLieu':
      return '调休放假'
    case 'weekend':
      return '休息日'
    case 'off':
      return '按排班休息'
    case 'notStarted':
      return '未入职'
  }
}
