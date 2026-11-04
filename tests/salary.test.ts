import { describe, expect, it } from 'vitest'
import bundled from '../src/data/holidays.json'
import type { HolidayData, SessionState, Settings } from '../src/core/types'
import { computeDayEarnings, computeEarnings } from '../src/core/salary'
import { toYmd } from '../src/core/dates'

const data = bundled as unknown as HolidayData

/** 每日排班 09:00-12:00 / 13:30-18:00,合计 450 分钟 */
const SLOTS = [
  { id: 'a', start: '09:00', end: '12:00' },
  { id: 'b', start: '13:30', end: '18:00' },
]

function makeSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    monthlySalary: 15000,
    slots: SLOTS,
    workDays: [1, 2, 3, 4, 5],
    weeklyOverrides: {},
    startDate: '',
    sessions: {},
    leaves: {},
    ...overrides,
  }
}

/** 每日排班 09:00-12:00 / 14:00-18:00,合计 420 分钟(7 小时) */
const SEVEN_HOUR_SLOTS = [
  { id: 'a', start: '09:00', end: '12:00' },
  { id: 'b', start: '14:00', end: '18:00' },
]

/** 周六按 3 小时折算半天 */
const HALF_SATURDAY = [{ id: 'half', start: '09:00', end: '12:00' }]

/** 某天从指定时刻开始计时,一直没收工 */
function clockedOn(date: Date, hour: number, minute = 0): Record<string, SessionState> {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, minute)
  return { [toYmd(start)]: { start: start.getTime(), end: null } }
}

/** 某天在指定区间内打卡并收工 */
function clockedBetween(
  date: Date,
  startHour: number,
  startMinute: number,
  endHour: number,
  endMinute: number,
): Record<string, SessionState> {
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), startHour, startMinute)
  const end = new Date(day.getFullYear(), day.getMonth(), day.getDate(), endHour, endMinute)
  return { [toYmd(start)]: { start: start.getTime(), end: end.getTime() } }
}

/** 一次生成多天的打卡记录 */
function sessionsOn(
  entries: Array<[Date, number, number?]>,
): Record<string, SessionState> {
  const out: Record<string, SessionState> = {}
  for (const [date, hour, minute = 0] of entries) {
    Object.assign(out, clockedOn(date, hour, minute))
  }
  return out
}

describe('日薪与月度累计', () => {
  it('日薪 = 月薪 / 当月工作日天数', () => {
    const result = computeEarnings(2026, 11, {
      settings: makeSettings(),
      data,
      now: new Date(2026, 10, 3, 10, 0),
    })
    expect(result.workdayCount).toBe(21)
    expect(result.dailyRate).toBeCloseTo(15000 / 21, 6)
  })

  it('今天未打卡时按已过的时段自动计薪', () => {
    const result = computeEarnings(2026, 11, {
      settings: makeSettings(),
      data,
      now: new Date(2026, 10, 2, 10, 0),
    })
    expect(result.todayIsWorkday).toBe(true)
    expect(result.todayClockedIn).toBe(false)
    // 09:00-10:00 共 60 分钟,当日排班 450 分钟
    expect(result.todayWorkedMinutes).toBe(60)
    expect(result.earnedToday).toBeCloseTo((15000 / 21) * (60 / 450), 6)
    expect(result.earnedTotal).toBeCloseTo((15000 / 21) * (60 / 450), 6)
  })

  it('还没到上班时间时不产生收入', () => {
    const result = computeEarnings(2026, 11, {
      settings: makeSettings(),
      data,
      now: new Date(2026, 10, 2, 8, 0),
    })
    expect(result.todayWorkedMinutes).toBe(0)
    expect(result.earnedToday).toBe(0)
  })

  it('打卡后按工作时段内已过时长累计', () => {
    const result = computeEarnings(2026, 11, {
      settings: makeSettings({ sessions: clockedOn(new Date(2026, 10, 2), 9) }),
      data,
      now: new Date(2026, 10, 2, 10, 0),
    })
    // 09:00-10:00 共 60 分钟,当日排班 450 分钟
    expect(result.todayClockedIn).toBe(true)
    expect(result.todayWorkedMinutes).toBe(60)
    expect(result.earnedToday).toBeCloseTo((15000 / 21) * (60 / 450), 6)
    expect(result.workedDays).toBe(0)
  })

  it('晚打卡会自动补上上班到打卡之间的时段', () => {
    const result = computeEarnings(2026, 11, {
      settings: makeSettings({ sessions: clockedOn(new Date(2026, 10, 2), 10) }),
      data,
      now: new Date(2026, 10, 2, 11, 0),
    })
    // 09:00-10:00 自动补卡,10:00-11:00 手动计时
    expect(result.todayWorkedMinutes).toBe(120)
    expect(result.earnedToday).toBeCloseTo((15000 / 21) * (120 / 450), 6)
  })

  it('午休时段不计入已工作时长', () => {
    const settings = makeSettings({ sessions: clockedOn(new Date(2026, 10, 2), 9) })
    const noon = computeEarnings(2026, 11, {
      settings,
      data,
      now: new Date(2026, 10, 2, 12, 30),
    })
    const morning = computeEarnings(2026, 11, {
      settings,
      data,
      now: new Date(2026, 10, 2, 12, 0),
    })
    // 12:00 -> 12:30 处于午休,两者相同
    expect(noon.earnedToday).toBeCloseTo(morning.earnedToday, 9)
    expect(noon.todayWorkedMinutes).toBe(180)
  })

  it('下班后当日收入封顶为整日日薪', () => {
    const result = computeEarnings(2026, 11, {
      settings: makeSettings({ sessions: clockedOn(new Date(2026, 10, 2), 9) }),
      data,
      now: new Date(2026, 10, 2, 23, 59),
    })
    expect(result.todayWorkedMinutes).toBe(450)
    expect(result.earnedToday).toBeCloseTo(15000 / 21, 6)
  })

  it('收工后收入冻结', () => {
    const settings = makeSettings({
      sessions: clockedBetween(new Date(2026, 10, 2), 9, 0, 10, 30),
    })
    const justAfter = computeEarnings(2026, 11, {
      settings,
      data,
      now: new Date(2026, 10, 2, 11, 0),
    })
    const lateNight = computeEarnings(2026, 11, {
      settings,
      data,
      now: new Date(2026, 10, 2, 23, 59),
    })
    expect(justAfter.todayWorkedMinutes).toBe(90)
    expect(lateNight.todayWorkedMinutes).toBe(90)
    expect(lateNight.earnedToday).toBeCloseTo((15000 / 21) * (90 / 450), 6)
  })

  it('休息日不产生收入', () => {
    const result = computeEarnings(2026, 11, {
      settings: makeSettings(),
      data,
      now: new Date(2026, 10, 7, 14, 0),
    })
    expect(result.todayIsWorkday).toBe(false)
    expect(result.earnedToday).toBe(0)
  })

  it('月末满勤累计恰好等于月薪', () => {
    for (let month = 1; month <= 12; month += 1) {
      const lastDay = new Date(2026, month, 0)
      const result = computeEarnings(2026, month, {
        settings: makeSettings({ sessions: clockedOn(lastDay, 0) }),
        data,
        now: new Date(2026, month, 0, 23, 59),
      })
      expect(result.earnedTotal).toBeCloseTo(15000, 4)
      expect(result.remaining).toBeCloseTo(0, 4)
    }
  })

  it('尚未开始上班的月份累计为零', () => {
    const result = computeEarnings(2026, 12, {
      settings: makeSettings(),
      data,
      now: new Date(2026, 10, 3, 10, 0),
    })
    expect(result.earnedTotal).toBe(0)
    expect(result.remaining).toBe(15000)
  })

  it('已过去的月份累计等于月薪', () => {
    const result = computeEarnings(2026, 10, {
      settings: makeSettings(),
      data,
      now: new Date(2026, 10, 3, 10, 0),
    })
    expect(result.earnedTotal).toBeCloseTo(15000, 4)
  })

  it('自然日进度:当月按已过天数,过往月份算满,未来月份为零', () => {
    const now = new Date(2026, 10, 4, 10, 0)
    const current = computeEarnings(2026, 11, { settings: makeSettings(), data, now })
    expect(current.monthElapsedRatio).toBeCloseTo(4 / 30, 6)
    const past = computeEarnings(2026, 10, { settings: makeSettings(), data, now })
    expect(past.monthElapsedRatio).toBe(1)
    const future = computeEarnings(2026, 12, { settings: makeSettings(), data, now })
    expect(future.monthElapsedRatio).toBe(0)
  })
})

describe('历史打卡记录', () => {
  it('过去的打卡按实际时长折算,没有记录的按满薪补发', () => {
    const result = computeEarnings(2026, 11, {
      settings: makeSettings({
        sessions: clockedBetween(new Date(2026, 10, 2), 9, 0, 10, 30),
      }),
      data,
      now: new Date(2026, 10, 5, 10, 0),
    })
    // 11-02 按 90 分钟折算,11-03 / 11-04 无记录按满薪,11-05 当天自动补卡 60 分钟
    expect(result.earnedTotal).toBeCloseTo((15000 / 21) * (90 / 450 + 2 + 60 / 450), 6)
    expect(result.workedDays).toBe(2)
  })

  it('未收工的过去日期按当天结束计算', () => {
    const result = computeEarnings(2026, 11, {
      settings: makeSettings({ sessions: clockedOn(new Date(2026, 10, 2), 9) }),
      data,
      now: new Date(2026, 10, 5, 10, 0),
    })
    // 11-02 整天计薪,11-03 / 11-04 满薪,11-05 当天自动补卡 60 分钟
    expect(result.earnedTotal).toBeCloseTo((15000 / 21) * (3 + 60 / 450), 6)
    expect(result.workedDays).toBe(3)
  })
})

describe('入职时间', () => {
  const startDate = '2026-11-16'

  it('入职当月按整月工作日均摊,入职前的工作日占名额但不计薪', () => {
    const result = computeEarnings(2026, 11, {
      settings: makeSettings({
        startDate,
        sessions: clockedOn(new Date(2026, 10, 30), 0),
      }),
      data,
      now: new Date(2026, 10, 30, 23, 59),
    })
    // 11 月共 21 个工作日,其中 11-02 至 11-06、11-09 至 11-13 在入职日之前
    expect(result.workdayCount).toBe(21)
    expect(result.preOnboardingWorkdays).toBe(10)
    expect(result.dailyRate).toBeCloseTo(15000 / 21, 6)
    // 入职后的 11 天照常计薪,满勤拿到的是月薪减去入职前的 10 天
    expect(result.earnedTotal).toBeCloseTo((15000 / 21) * 11, 4)
    expect(result.monthCap).toBeCloseTo((15000 / 21) * 11, 4)
    expect(result.remaining).toBeCloseTo(0, 4)
    expect(result.ratio).toBeCloseTo(1, 6)
  })

  it('入职前的月份没有工作日也不计薪', () => {
    const result = computeEarnings(2026, 10, {
      settings: makeSettings({ startDate }),
      data,
      now: new Date(2026, 10, 3, 10, 0),
    })
    expect(result.workdayCount).toBe(0)
    expect(result.dailyRate).toBe(0)
    expect(result.earnedTotal).toBe(0)
    expect(result.monthCap).toBe(0)
    expect(result.remaining).toBe(0)
    expect(result.ratio).toBe(0)
  })

  it('入职前的日期标记为未入职', () => {
    const result = computeEarnings(2026, 11, {
      settings: makeSettings({ startDate }),
      data,
      now: new Date(2026, 10, 3, 10, 0),
    })
    const before = result.days.find((day) => day.date === '2026-11-15')
    const onDay = result.days.find((day) => day.date === '2026-11-16')
    expect(before?.kind).toBe('notStarted')
    expect(before?.isWorkday).toBe(false)
    expect(onDay?.kind).toBe('workday')
    expect(onDay?.isWorkday).toBe(true)
  })

  it('入职前的打卡记录不产生收入', () => {
    const result = computeEarnings(2026, 11, {
      settings: makeSettings({
        startDate,
        sessions: clockedOn(new Date(2026, 10, 2), 9),
      }),
      data,
      now: new Date(2026, 10, 20, 23, 59),
    })
    // 11-16 至 11-20 共 5 天按满薪,11-20 当天自动补卡也按满薪
    expect(result.workdayCount).toBe(21)
    expect(result.earnedTotal).toBeCloseTo((15000 / 21) * 5, 6)
  })

  it('入职当月的满勤工资会扣掉入职前的每一天', () => {
    const result = computeEarnings(2026, 10, {
      settings: makeSettings({ monthlySalary: 5000, startDate: '2026-10-09' }),
      data,
      now: new Date(2026, 9, 31, 23, 59),
    })
    // 10 月共 18 个工作日,10/08 在入职日之前
    expect(result.workdayCount).toBe(18)
    expect(result.preOnboardingWorkdays).toBe(1)
    expect(result.dailyRate).toBeCloseTo(5000 / 18, 6)
    // 满勤只拿 17 天的工资,正好扣掉一天
    expect(result.earnedTotal).toBeCloseTo(5000 - 5000 / 18, 6)
    expect(result.monthCap).toBeCloseTo(5000 - 5000 / 18, 6)
    expect(result.remaining).toBeCloseTo(0, 6)
    expect(result.ratio).toBeCloseTo(1, 6)
  })

  it('入职日之前的那个工作日没有收入', () => {
    const result = computeEarnings(2026, 10, {
      settings: makeSettings({ monthlySalary: 5000, startDate: '2026-10-09' }),
      data,
      now: new Date(2026, 9, 31, 23, 59),
    })
    const before = result.days.find((day) => day.date === '2026-10-08')
    expect(before?.kind).toBe('notStarted')
    expect(before?.isWorkday).toBe(false)
    // 该日仍计入当月工作日总数
    expect(result.workdays).toContain('2026-10-08')
  })

  it('入职日是月初时没有任何扣除', () => {
    const result = computeEarnings(2026, 10, {
      settings: makeSettings({ monthlySalary: 5000, startDate: '2026-10-01' }),
      data,
      now: new Date(2026, 9, 31, 23, 59),
    })
    expect(result.preOnboardingWorkdays).toBe(0)
    expect(result.monthCap).toBe(5000)
    expect(result.earnedTotal).toBeCloseTo(5000, 4)
    expect(result.ratio).toBeCloseTo(1, 6)
  })
})

describe('按星期覆盖时段', () => {
  it('覆盖生效时使用覆盖的排班时长', () => {
    const settings = makeSettings({
      weeklyOverrides: {
        2: [{ id: 'x', start: '10:00', end: '16:00' }],
      },
      sessions: clockedOn(new Date(2026, 10, 3), 10),
    })
    // 2026-11-03 是周二
    const result = computeEarnings(2026, 11, {
      settings,
      data,
      now: new Date(2026, 10, 3, 11, 0),
    })
    // 覆盖排班 10:00-16:00 共 360 分钟,已过 60 分钟
    expect(result.todayScheduledMinutes).toBe(360)
    expect(result.todayWorkedMinutes).toBe(60)
  })
})

describe('边界情况', () => {
  it('月薪为 0 时不产生 NaN', () => {
    const result = computeEarnings(2026, 11, {
      settings: makeSettings({ monthlySalary: 0 }),
      data,
      now: new Date(2026, 10, 3, 10, 0),
    })
    expect(Number.isNaN(result.earnedTotal)).toBe(false)
    expect(result.dailyRate).toBe(0)
    expect(result.ratio).toBe(0)
  })

  it('未配置有效时段时今日收入为零但不算崩', () => {
    const result = computeEarnings(2026, 11, {
      settings: makeSettings({ slots: [] }),
      data,
      now: new Date(2026, 10, 3, 10, 0),
    })
    expect(result.earnedToday).toBe(0)
    expect(Number.isNaN(result.earnedTotal)).toBe(false)
  })

  it('跨月边界的日期不串月', () => {
    const result = computeEarnings(2026, 11, {
      settings: makeSettings(),
      data,
      now: new Date(2026, 10, 1, 0, 30),
    })
    // 11 月 1 日是周日,不上班
    expect(result.todayIsWorkday).toBe(false)
    expect(result.workedDays).toBe(0)
  })

  it('多天打卡记录互不干扰', () => {
    const result = computeEarnings(2026, 11, {
      settings: makeSettings({
        sessions: sessionsOn([
          [new Date(2026, 10, 2), 9],
          [new Date(2026, 10, 3), 9],
          [new Date(2026, 10, 4), 9],
        ]),
      }),
      data,
      now: new Date(2026, 10, 4, 23, 59),
    })
    // 11-02、11-03 按满时长,11-04 当天打卡后按满时长
    expect(result.earnedTotal).toBeCloseTo((15000 / 21) * 3, 6)
  })
})

describe('小时模型与每周排班', () => {
  it('双休时 10 月排班 126 小时', () => {
    const result = computeEarnings(2026, 10, {
      settings: makeSettings({ monthlySalary: 5000, slots: SEVEN_HOUR_SLOTS }),
      data,
      now: new Date(2026, 9, 31, 23, 59),
    })
    expect(result.workdayCount).toBe(18)
    expect(result.scheduledHours).toBeCloseTo(126, 6)
    expect(result.hourlyRate).toBeCloseTo(5000 / 126, 6)
  })

  it('单休时周六按整天累加排班工时', () => {
    const result = computeEarnings(2026, 11, {
      settings: makeSettings({
        slots: SEVEN_HOUR_SLOTS,
        workDays: [1, 2, 3, 4, 5, 6],
      }),
      data,
      now: new Date(2026, 10, 3, 10, 0),
    })
    // 11 月共 21 个工作日 + 4 个周六
    expect(result.workdayCount).toBe(25)
    expect(result.scheduledHours).toBeCloseTo(25 * 7, 6)
    expect(result.hourlyRate).toBeCloseTo(15000 / (25 * 7), 6)
  })

  it('五点五天时周六只贡献半天工时', () => {
    const settings = makeSettings({
      slots: SEVEN_HOUR_SLOTS,
      workDays: [1, 2, 3, 4, 5, 6],
      weeklyOverrides: { 6: HALF_SATURDAY },
    })
    const result = computeEarnings(2026, 11, {
      settings,
      data,
      now: new Date(2026, 10, 3, 10, 0),
    })
    // 21 个工作日 7 小时 + 4 个周六 3 小时
    expect(result.workdayCount).toBe(25)
    expect(result.scheduledHours).toBeCloseTo(21 * 7 + 4 * 3, 6)

    // 2026-11-07 是周六,排班 3 小时,满勤也只赚 3 小时的钱
    const saturday = computeDayEarnings(
      '2026-11-07',
      result.hourlyRate,
      settings,
      data,
      new Date(2026, 10, 7, 23, 59),
    )
    expect(saturday.scheduledMinutes).toBe(180)
    expect(saturday.workedMinutes).toBe(180)
    expect(saturday.earned).toBeCloseTo(result.hourlyRate * 3, 6)
  })

  it('调休补班日按整天上班,忽略当天的星期覆盖', () => {
    const settings = makeSettings({
      monthlySalary: 5000,
      slots: SEVEN_HOUR_SLOTS,
      workDays: [1, 2, 3, 4, 5, 6],
      weeklyOverrides: { 6: HALF_SATURDAY },
      startDate: '2026-10-01',
    })
    const result = computeEarnings(2026, 10, {
      settings,
      data,
      now: new Date(2026, 9, 31, 23, 59),
    })
    // 17 个工作日 7 小时 + 10/10 补班整天 7 小时 + 3 个周六 3 小时
    expect(result.workdayCount).toBe(21)
    expect(result.scheduledHours).toBeCloseTo(135, 6)
    const makeup = result.days.find((day) => day.date === '2026-10-10')
    expect(makeup?.kind).toBe('makeup')
  })

  it('入职当月按小时扣除入职前的工时', () => {
    const settings = makeSettings({
      monthlySalary: 5000,
      slots: SEVEN_HOUR_SLOTS,
      workDays: [1, 2, 3, 4, 5, 6],
      weeklyOverrides: { 6: HALF_SATURDAY },
      startDate: '2026-10-09',
    })
    const result = computeEarnings(2026, 10, {
      settings,
      data,
      now: new Date(2026, 9, 31, 23, 59),
    })
    // 10 月排班 135 小时,入职日之前的 10-08 占 7 小时
    expect(result.scheduledHours).toBeCloseTo(135, 6)
    expect(result.preOnboardingHours).toBeCloseTo(7, 6)
    expect(result.preOnboardingWorkdays).toBe(1)
    // 满勤实发 = 5000 × 128/135
    expect(result.monthCap).toBeCloseTo((5000 * 128) / 135, 4)
    expect(result.earnedTotal).toBeCloseTo((5000 * 128) / 135, 4)
    expect(result.ratio).toBeCloseTo(1, 6)
  })

  it('本月工资 = 出勤工时 ÷ 排班工时 × 月薪', () => {
    const settings = makeSettings({ slots: SEVEN_HOUR_SLOTS })
    const result = computeEarnings(2026, 11, {
      settings,
      data,
      now: new Date(2026, 10, 5, 14, 0),
    })
    expect(result.scheduledHours).toBeCloseTo(21 * 7, 6)
    expect(result.earnedTotal).toBeCloseTo(
      (result.workedHours / result.scheduledHours) * settings.monthlySalary,
      6,
    )
  })

  it('排班全部落在休息日时不产生收入', () => {
    const result = computeEarnings(2026, 11, {
      settings: makeSettings({ workDays: [] }),
      data,
      now: new Date(2026, 10, 3, 10, 0),
    })
    expect(result.workdayCount).toBe(0)
    expect(result.scheduledHours).toBe(0)
    expect(result.hourlyRate).toBe(0)
    expect(result.earnedTotal).toBe(0)
    expect(result.monthCap).toBe(0)
  })
})
