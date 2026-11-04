import type { DayInfo, EarningsResult, HolidayData, Settings } from './types'
import { daysInMonth, fromYmd, toYmd } from './dates'
import { monthDays } from './calendar'
import { daySchedule, monthSchedule } from './schedule'
import { overlapSlotMinutes } from './timeslots'
import { effectiveWork } from './session'

export interface EarningsInput {
  settings: Settings
  data: HolidayData
  /** 当前时刻 */
  now: Date
}

export interface DayEarnings {
  date: string
  isWorkday: boolean
  /** 当日排班总时长(分钟) */
  scheduledMinutes: number
  /** 当日已工作时长(分钟) */
  workedMinutes: number
  /** 当日已赚工资 */
  earned: number
  /** 相对当前时刻的状态 */
  state: 'past' | 'today' | 'future' | 'rest'
  /** 当日是否已开始计时 */
  clockedIn: boolean
  /** 收入中是否含有自动补卡的部分 */
  autoFilled: boolean
}

/**
 * 计算某一天截至 now 的收入。
 *
 * 计薪口径(全部以小时为准):
 * - 小时工资 = 月薪 ÷ 本月排班总工时(x)
 * - 当日收入 = 小时工资 × 当日已工作小时数
 * - 今天不用打卡:上班时刻起自动补卡,到点自动收工
 * - 手动打卡时,自动补卡段[上班时刻 → 打卡时刻]与手动段[打卡时刻 → 收工]相加
 * - 过去的工作日若留有打卡记录按记录计算,否则按整日工时计入
 * - 未来的工作日与休息日不计收益
 * - 入职日之前的日期一律不计薪
 */
export function computeDayEarnings(
  date: string,
  hourlyRate: number,
  settings: Settings,
  data: HolidayData,
  now: Date,
): DayEarnings {
  const schedule = daySchedule(date, settings, data)
  const today = toYmd(now)
  const session = settings.sessions[date]
  const notOnboarded = Boolean(settings.startDate) && date < settings.startDate

  if (!schedule.isWorkday || notOnboarded) {
    return {
      date,
      isWorkday: false,
      scheduledMinutes: 0,
      workedMinutes: 0,
      earned: 0,
      state: 'rest',
      clockedIn: false,
      autoFilled: false,
    }
  }

  const scheduledMinutes = schedule.scheduledMinutes

  if (date > today) {
    return {
      date,
      isWorkday: true,
      scheduledMinutes,
      workedMinutes: 0,
      earned: 0,
      state: 'future',
      clockedIn: false,
      autoFilled: false,
    }
  }

  const work = effectiveWork(date, session, schedule.slots, now)
  const workedMinutes = Math.min(
    scheduledMinutes,
    work.segments.reduce(
      (sum, segment) => sum + overlapSlotMinutes(schedule.slots, segment.from, segment.to),
      0,
    ),
  )

  return {
    date,
    isWorkday: true,
    scheduledMinutes,
    workedMinutes,
    earned: hourlyRate * (workedMinutes / 60),
    state: date < today ? 'past' : 'today',
    clockedIn: Boolean(session),
    autoFilled: work.autoFilled,
  }
}

/**
 * 计算某年某月截至 now 的工资累计。
 *
 * 口径(小时模型):
 * - x = 本月排班总工时(含入职日之前的工作日)
 * - y = 本月实际出勤工时
 * - 小时工资 = 月薪 ÷ x
 * - 本月工资 = 小时工资 × y,等价于 y ÷ x × 月薪
 *
 * 入职当月以整月排班工时为分母,入职日之前的工时计入分母但不产生收入,
 * 因此当月实发上限 = 月薪 × (入职后工时 ÷ 整月工时)。
 */
export function computeEarnings(
  year: number,
  month: number,
  input: EarningsInput,
): EarningsResult {
  const { settings, data, now } = input
  const startDate = settings.startDate
  const days: DayInfo[] = monthDays(year, month, data, startDate, settings.workDays)
  const schedule = monthSchedule(year, month, settings, data)

  // 整月都早于入职日的月份不计薪
  const monthEnd = toYmd(new Date(year, month, 0))
  const beforeOnboarding = Boolean(startDate) && monthEnd < startDate

  // 分母 x:整月排班总工时,入职日之前的工作日同样占名额
  const scheduledMinutes = beforeOnboarding
    ? 0
    : schedule.reduce((sum, day) => sum + day.scheduledMinutes, 0)
  const scheduledHours = scheduledMinutes / 60
  const hourlyRate = scheduledMinutes > 0 ? settings.monthlySalary / scheduledHours : 0

  // 入职日之后的排班工时,决定本月实发上限
  const onboardedMinutes = beforeOnboarding
    ? 0
    : schedule.reduce(
        (sum, day) =>
          sum + (startDate && day.date < startDate ? 0 : day.scheduledMinutes),
        0,
      )
  const preOnboardingHours = (scheduledMinutes - onboardedMinutes) / 60

  const workdays = beforeOnboarding
    ? []
    : schedule.filter((day) => day.isWorkday).map((day) => day.date)
  const workdayCount = workdays.length
  // 折合日薪仅作展示:月薪 ÷ 当月工作日天数
  const dailyRate = workdayCount > 0 ? settings.monthlySalary / workdayCount : 0
  const preOnboardingWorkdays = startDate
    ? workdays.filter((date) => date < startDate).length
    : 0
  const monthCap =
    scheduledMinutes > 0
      ? settings.monthlySalary * (onboardedMinutes / scheduledMinutes)
      : 0

  const today = toYmd(now)

  let earnedTotal = 0
  let workedMinutesTotal = 0
  let workedDays = 0
  let todayIsWorkday = false
  let todayClockedIn = false
  let todayScheduledMinutes = 0
  let todayWorkedMinutes = 0
  let earnedToday = 0

  for (const day of days) {
    if (!day.isWorkday) continue
    const dayEarnings = computeDayEarnings(day.date, hourlyRate, settings, data, now)

    if (dayEarnings.state === 'past') {
      earnedTotal += dayEarnings.earned
      workedMinutesTotal += dayEarnings.workedMinutes
      if (dayEarnings.workedMinutes >= dayEarnings.scheduledMinutes) {
        workedDays += 1
      }
    } else if (dayEarnings.state === 'today') {
      todayIsWorkday = true
      todayClockedIn = dayEarnings.clockedIn
      todayScheduledMinutes = dayEarnings.scheduledMinutes
      todayWorkedMinutes = dayEarnings.workedMinutes
      earnedToday = dayEarnings.earned
      earnedTotal += earnedToday
      workedMinutesTotal += dayEarnings.workedMinutes
    }
  }

  const remaining = Math.max(0, monthCap - earnedTotal)
  const ratio = monthCap > 0 ? earnedTotal / monthCap : 0
  const totalDays = daysInMonth(year, month)

  return {
    days,
    workdays,
    workdayCount,
    scheduledHours,
    workedHours: workedMinutesTotal / 60,
    hourlyRate,
    dailyRate,
    preOnboardingWorkdays,
    preOnboardingHours,
    monthCap,
    workedDays,
    todayIsWorkday,
    todayScheduledMinutes,
    todayWorkedMinutes,
    todayClockedIn,
    earnedToday,
    earnedTotal,
    remaining,
    ratio,
    monthElapsedRatio: elapsedDaysInMonth(totalDays, today, year, month) / totalDays,
  }
}

/** 本月已经过去的自然日天数 */
function elapsedDaysInMonth(totalDays: number, today: string, year: number, month: number): number {
  const current = fromYmd(today)
  const inMonth = current.getFullYear() === year && current.getMonth() + 1 === month
  if (inMonth) return current.getDate()
  // 已经过去的月份算满整月,还没到的月份算 0
  return current < new Date(year, month - 1, 1) ? 0 : totalDays
}
