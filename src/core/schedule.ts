import type { DayKind, HolidayData, Settings, TimeSlot } from './types'
import { dayStatus } from './calendar'
import { slotsForDate, totalSlotMinutes } from './timeslots'
import { daysInMonth, toYmd } from './dates'

export interface DaySchedule {
  date: string
  kind: DayKind
  name: string
  isWorkday: boolean
  /** 当天生效的工作时段 */
  slots: TimeSlot[]
  /** 当天排班工时(分钟) */
  scheduledMinutes: number
}

/**
 * 某一天的排班。
 *
 * - 调休补班日按国家安排整天上班,用标准日时段,忽略该星期几的时段覆盖;
 * - 其余工作日按星期覆盖优先,没有覆盖时用每日默认时段;
 * - 法定假日、调休放假与休息日没有排班。
 */
export function daySchedule(
  date: string,
  settings: Settings,
  data: HolidayData,
): DaySchedule {
  const status = dayStatus(date, data, settings.workDays)
  const slots =
    status.kind === 'makeup'
      ? settings.slots
      : status.isWorkday
        ? slotsForDate(date, settings.slots, settings.weeklyOverrides)
        : []

  return {
    date,
    kind: status.kind,
    name: status.name,
    isWorkday: status.isWorkday,
    slots,
    scheduledMinutes: status.isWorkday ? totalSlotMinutes(slots) : 0,
  }
}

/** 某月逐日排班(不含入职过滤,入职过滤在计薪时处理) */
export function monthSchedule(
  year: number,
  month: number,
  settings: Settings,
  data: HolidayData,
): DaySchedule[] {
  const total = daysInMonth(year, month)
  const list: DaySchedule[] = []
  for (let day = 1; day <= total; day += 1) {
    const date = toYmd(new Date(year, month - 1, day))
    list.push(daySchedule(date, settings, data))
  }
  return list
}
