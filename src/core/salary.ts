import type { DayInfo, EarningsResult, HolidayData, Settings } from './types'
import { daysInMonth, fromYmd, minutesSinceMidnight, toYmd } from './dates'
import { monthDays } from './calendar'
import { daySchedule, monthSchedule } from './schedule'
import { overlapSlotMinutes } from './timeslots'
import { effectiveWork } from './session'
import { leavePaidMinutesUntil } from './leave'

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
  /** 当日排班扣除请假后的应出勤时长(分钟) */
  attendedMinutes: number
  /** 当日已出勤时长(分钟)—— 已排除请假时段 */
  workedMinutes: number
  /** 当日计入工资的时长(分钟)—— 出勤时长 + 带薪请假时长 */
  creditedMinutes: number
  /** 当日请假与排班重叠的总时长(分钟) */
  leaveMinutes: number
  /** 当日请假折算后被扣掉的等效时长(分钟) */
  leaveDeductedMinutes: number
  /** 当日请假中仍然带薪的时长(分钟) */
  leavePaidMinutes: number
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
 * - 当日收入 = 小时工资 × 当日计入工资的时长(出勤 + 带薪请假)
 * - 今天不用打卡:上班时刻起自动补卡,到点自动收工
 * - 手动打卡时,自动补卡段[上班时刻 → 打卡时刻]与手动段[打卡时刻 → 收工]相加
 * - 过去的工作日若留有打卡记录按记录计算,否则按整日工时计入
 * - 未来的工作日与休息日不计收益
 * - 入职日之前的日期一律不计薪
 * - 请假时段不产生出勤收入;带薪部分(扣除比例 < 100%)按比例计入工资
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
      attendedMinutes: 0,
      workedMinutes: 0,
      creditedMinutes: 0,
      leaveMinutes: 0,
      leaveDeductedMinutes: 0,
      leavePaidMinutes: 0,
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
      attendedMinutes: schedule.attendedMinutes,
      workedMinutes: 0,
      creditedMinutes: 0,
      leaveMinutes: schedule.leaveMinutes,
      leaveDeductedMinutes: schedule.leaveDeductedMinutes,
      leavePaidMinutes: 0,
      earned: 0,
      state: 'future',
      clockedIn: false,
      autoFilled: false,
    }
  }

  // 出勤只按扣除请假后的时段计算,请假期间打卡不产生收入
  const work = effectiveWork(date, session, schedule.workSlots, now)
  const workedMinutes = Math.min(
    schedule.attendedMinutes,
    work.segments.reduce(
      (sum, segment) => sum + overlapSlotMinutes(schedule.workSlots, segment.from, segment.to),
      0,
    ),
  )

  // 带薪请假按时间流逝计入:过去的日子算满一整天,今天只算到当前时刻
  const cutoff = date < today ? 1440 : minutesSinceMidnight(now)
  const leavePaidMinutes = leavePaidMinutesUntil(
    settings.leaves[date] ?? [],
    schedule.slots,
    cutoff,
  )
  const creditedMinutes = workedMinutes + leavePaidMinutes

  return {
    date,
    isWorkday: true,
    scheduledMinutes,
    attendedMinutes: schedule.attendedMinutes,
    workedMinutes,
    creditedMinutes,
    leaveMinutes: schedule.leaveMinutes,
    leaveDeductedMinutes: schedule.leaveDeductedMinutes,
    leavePaidMinutes,
    earned: hourlyRate * (creditedMinutes / 60),
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

  // 请假只统计入职之后的日期;入职前的日期本来就不计薪,请假也不影响分母
  const onboardedDays = beforeOnboarding
    ? []
    : schedule.filter((day) => !(startDate && day.date < startDate))
  const leaveMinutesTotal = onboardedDays.reduce((sum, day) => sum + day.leaveMinutes, 0)
  const leaveDeductedMinutesTotal = onboardedDays.reduce(
    (sum, day) => sum + day.leaveDeductedMinutes,
    0,
  )
  const leaveCount = onboardedDays.reduce((sum, day) => sum + day.leaveCount, 0)

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
      ? settings.monthlySalary *
        (Math.max(0, onboardedMinutes - leaveDeductedMinutesTotal) / scheduledMinutes)
      : 0

  const today = toYmd(now)

  let earnedTotal = 0
  let workedMinutesTotal = 0
  let creditedMinutesTotal = 0
  let workedDays = 0
  let todayIsWorkday = false
  let todayClockedIn = false
  let todayScheduledMinutes = 0
  let todayWorkedMinutes = 0
  let todayCreditedMinutes = 0
  let earnedToday = 0

  for (const day of days) {
    if (!day.isWorkday) continue
    const dayEarnings = computeDayEarnings(day.date, hourlyRate, settings, data, now)

    if (dayEarnings.state === 'past') {
      earnedTotal += dayEarnings.earned
      workedMinutesTotal += dayEarnings.workedMinutes
      creditedMinutesTotal += dayEarnings.creditedMinutes
      // 出勤 + 请假覆盖 = 整日排班,算这一天没有缺勤
      if (
        dayEarnings.workedMinutes + dayEarnings.leaveMinutes >=
        dayEarnings.scheduledMinutes
      ) {
        workedDays += 1
      }
    } else if (dayEarnings.state === 'today') {
      todayIsWorkday = true
      todayClockedIn = dayEarnings.clockedIn
      todayScheduledMinutes = dayEarnings.scheduledMinutes
      todayWorkedMinutes = dayEarnings.workedMinutes
      todayCreditedMinutes = dayEarnings.creditedMinutes
      earnedToday = dayEarnings.earned
      earnedTotal += earnedToday
      workedMinutesTotal += dayEarnings.workedMinutes
      creditedMinutesTotal += dayEarnings.creditedMinutes
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
    creditedHours: creditedMinutesTotal / 60,
    leaveHours: leaveMinutesTotal / 60,
    leaveDeductedHours: leaveDeductedMinutesTotal / 60,
    leaveDeduction: (leaveDeductedMinutesTotal / 60) * hourlyRate,
    leaveCount,
    hourlyRate,
    dailyRate,
    preOnboardingWorkdays,
    preOnboardingHours,
    monthCap,
    workedDays,
    todayIsWorkday,
    todayScheduledMinutes,
    todayWorkedMinutes,
    todayCreditedMinutes,
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
