import type { DayKind, HolidayData, Settings, TimeSlot } from './types'
import { dayStatus } from './calendar'
import { slotsForDate, totalSlotMinutes } from './timeslots'
import { daysInMonth, toYmd } from './dates'
import { leaveComputation, workSlotsAfterLeave } from './leave'

export interface DaySchedule {
  date: string
  kind: DayKind
  name: string
  isWorkday: boolean
  /** 当天生效的工作时段(含请假,作为计薪分母) */
  slots: TimeSlot[]
  /** 扣除请假后的有效工作时段(计薪时真正出勤的部分) */
  workSlots: TimeSlot[]
  /** 当天排班工时(分钟) */
  scheduledMinutes: number
  /** 当天实际需要出勤的工时(分钟)—— 排班扣除请假后 */
  attendedMinutes: number
  /** 当天与排班重叠的请假时长(分钟) */
  leaveMinutes: number
  /** 当天请假折算后被扣掉的等效工时(分钟) */
  leaveDeductedMinutes: number
  /** 当天请假中仍然带薪的时长(分钟) */
  leavePaidMinutes: number
  /** 当天与排班有重叠的请假条数 */
  leaveCount: number
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

  const records = settings.leaves[date] ?? []
  const leave = leaveComputation(records, slots)
  const workSlots = workSlotsAfterLeave(slots, records)

  return {
    date,
    kind: status.kind,
    name: status.name,
    isWorkday: status.isWorkday,
    slots,
    workSlots,
    scheduledMinutes: status.isWorkday ? totalSlotMinutes(slots) : 0,
    attendedMinutes: status.isWorkday ? totalSlotMinutes(workSlots) : 0,
    leaveMinutes: leave.total,
    leaveDeductedMinutes: leave.deducted,
    leavePaidMinutes: leave.paid,
    leaveCount: leave.count,
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
