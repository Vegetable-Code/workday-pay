import { describe, expect, it } from 'vitest'
import bundled from '../src/data/holidays.json'
import type {
  HolidayData,
  LeaveKind,
  LeaveRecord,
  SessionState,
  Settings,
} from '../src/core/types'
import { computeDayEarnings, computeEarnings } from '../src/core/salary'
import { daySchedule } from '../src/core/schedule'
import {
  clampPercent,
  leaveComputation,
  leavePaidMinutesUntil,
  workSlotsAfterLeave,
} from '../src/core/leave'

const data = bundled as unknown as HolidayData

// 每日排班 09:00-12:00 / 13:30-18:00,合计 450 分钟
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

let leaveSeq = 0

// 造一条请假记录
function leave(
  date: string,
  start: string,
  end: string,
  deductPercent = 100,
  kind: LeaveKind = 'personal',
): LeaveRecord {
  leaveSeq += 1
  return { id: `leave-${leaveSeq}`, date, start, end, kind, deductPercent }
}

describe('请假时长统计', () => {
  it('只统计与排班重叠的时长', () => {
    const result = leaveComputation([leave('2026-11-02', '09:00', '12:00')], SLOTS)
    expect(result.total).toBe(180)
    expect(result.deducted).toBe(180)
    expect(result.paid).toBe(0)
    expect(result.count).toBe(1)
  })

  it('休息时间不计入请假', () => {
    const result = leaveComputation([leave('2026-11-02', '12:00', '13:30')], SLOTS)
    expect(result.total).toBe(0)
    expect(result.count).toBe(0)
  })

  it('扣 0% 表示带薪假,全额计入工资', () => {
    const result = leaveComputation([leave('2026-11-02', '09:00', '12:00', 0)], SLOTS)
    expect(result.total).toBe(180)
    expect(result.deducted).toBe(0)
    expect(result.paid).toBe(180)
  })

  it('扣 50% 时折算一半', () => {
    const result = leaveComputation([leave('2026-11-02', '09:00', '12:00', 50)], SLOTS)
    expect(result.deducted).toBe(90)
    expect(result.paid).toBe(90)
  })

  it('跨越午休的请假拆成多段统计', () => {
    const result = leaveComputation([leave('2026-11-02', '11:00', '14:00')], SLOTS)
    // 11:00-12:00 共 60 分钟,13:30-14:00 共 30 分钟
    expect(result.total).toBe(90)
  })

  it('多条请假可以叠加', () => {
    const records = [
      leave('2026-11-02', '09:00', '10:00'),
      leave('2026-11-02', '10:00', '11:00'),
    ]
    const result = leaveComputation(records, SLOTS)
    expect(result.total).toBe(120)
    expect(result.count).toBe(2)
  })

  it('百分比越界时收敛到 0~100', () => {
    expect(clampPercent(-10)).toBe(0)
    expect(clampPercent(150)).toBe(100)
    expect(clampPercent(33.4)).toBe(33)
    expect(clampPercent(Number.NaN)).toBe(100)
  })
})

describe('扣除请假后的工作时段', () => {
  it('请半天就只剩下半天', () => {
    const work = workSlotsAfterLeave(SLOTS, [leave('2026-11-02', '09:00', '12:00')])
    expect(work).toHaveLength(1)
    expect(work[0]?.start).toBe('13:30')
    expect(work[0]?.end).toBe('18:00')
  })

  it('全天请假时没有需要出勤的时段', () => {
    const work = workSlotsAfterLeave(SLOTS, [leave('2026-11-02', '09:00', '18:00')])
    expect(work).toHaveLength(0)
  })

  it('把排班挖成前后两段', () => {
    const work = workSlotsAfterLeave(SLOTS, [leave('2026-11-02', '11:00', '14:00')])
    expect(work).toHaveLength(2)
    expect(work[0]?.start).toBe('09:00')
    expect(work[0]?.end).toBe('11:00')
    expect(work[1]?.start).toBe('14:00')
    expect(work[1]?.end).toBe('18:00')
  })
})

describe('带薪请假按时间流逝计入', () => {
  it('今天只算到当前时刻', () => {
    const records = [leave('2026-11-02', '09:00', '12:00', 0)]
    expect(leavePaidMinutesUntil(records, SLOTS, 600)).toBe(60)
  })

  it('全额扣除时没有带薪部分', () => {
    const records = [leave('2026-11-02', '09:00', '12:00', 100)]
    expect(leavePaidMinutesUntil(records, SLOTS, 720)).toBe(0)
  })

  it('过去的日子按整天计算', () => {
    const records = [leave('2026-11-02', '09:00', '12:00', 0)]
    expect(leavePaidMinutesUntil(records, SLOTS, 1440)).toBe(180)
  })

  it('还没开始的请假不计入', () => {
    const records = [leave('2026-11-02', '09:00', '12:00', 0)]
    expect(leavePaidMinutesUntil(records, SLOTS, 540)).toBe(0)
  })
})

describe('排班与请假联动', () => {
  it('排班时长不变,应出勤时长扣除请假', () => {
    const day = daySchedule(
      '2026-11-02',
      makeSettings({
        leaves: { '2026-11-02': [leave('2026-11-02', '09:00', '12:00', 100)] },
      }),
      data,
    )
    expect(day.scheduledMinutes).toBe(450)
    expect(day.attendedMinutes).toBe(270)
    expect(day.leaveMinutes).toBe(180)
    expect(day.leaveDeductedMinutes).toBe(180)
    expect(day.leaveCount).toBe(1)
  })
})

describe('请假与打卡', () => {
  const date = '2026-11-02'
  const sessions: Record<string, SessionState> = {
    [date]: {
      start: new Date(2026, 10, 2, 9, 0).getTime(),
      end: new Date(2026, 10, 2, 18, 0).getTime(),
    },
  }
  const now = new Date(2026, 10, 2, 23, 59)

  it('请假时段内打卡不产生收入', () => {
    const settings = makeSettings({
      sessions,
      leaves: { [date]: [leave(date, '09:00', '12:00', 100)] },
    })
    const day = computeDayEarnings(date, 200, settings, data, now)
    // 只剩 13:30-18:00 的 270 分钟能产生收入
    expect(day.workedMinutes).toBe(270)
    expect(day.creditedMinutes).toBe(270)
    expect(day.leaveMinutes).toBe(180)
  })

  it('带薪假期间打卡仍能拿满这段工资', () => {
    const settings = makeSettings({
      sessions,
      leaves: { [date]: [leave(date, '09:00', '12:00', 0)] },
    })
    const day = computeDayEarnings(date, 200, settings, data, now)
    expect(day.workedMinutes).toBe(270)
    expect(day.leavePaidMinutes).toBe(180)
    expect(day.creditedMinutes).toBe(450)
    expect(day.earned).toBeCloseTo(200 * 7.5, 6)
  })

  it('全天请假且全额扣除时当天没有收入', () => {
    const settings = makeSettings({
      sessions,
      leaves: { [date]: [leave(date, '09:00', '18:00', 100)] },
    })
    const day = computeDayEarnings(date, 200, settings, data, now)
    expect(day.workedMinutes).toBe(0)
    expect(day.creditedMinutes).toBe(0)
    expect(day.earned).toBe(0)
  })

  it('打卡时间完全落在请假时段内时不产生出勤收入', () => {
    const settings = makeSettings({
      // 09:30 打卡、11:30 收工,整段都在 09:00-12:00 的请假里
      sessions: {
        [date]: {
          start: new Date(2026, 10, 2, 9, 30).getTime(),
          end: new Date(2026, 10, 2, 11, 30).getTime(),
        },
      },
      leaves: { [date]: [leave(date, '09:00', '12:00', 100)] },
    })
    const day = computeDayEarnings(date, 200, settings, data, now)
    expect(day.workedMinutes).toBe(0)
    expect(day.creditedMinutes).toBe(0)
    expect(day.earned).toBe(0)
  })

  it('打卡跨越请假时段时只对未请假部分计薪', () => {
    const settings = makeSettings({
      // 11:00 打卡、14:00 收工,跨过 09:00-12:00 的请假
      sessions: {
        [date]: {
          start: new Date(2026, 10, 2, 11, 0).getTime(),
          end: new Date(2026, 10, 2, 14, 0).getTime(),
        },
      },
      leaves: { [date]: [leave(date, '09:00', '12:00', 100)] },
    })
    const day = computeDayEarnings(date, 200, settings, data, now)
    // 11:00-12:00 在请假里,13:30-14:00 是真实出勤
    expect(day.workedMinutes).toBe(30)
    expect(day.leaveMinutes).toBe(180)
    expect(day.creditedMinutes).toBe(30)
  })

  it('带薪假的打卡时段不影响带薪工时', () => {
    const settings = makeSettings({
      sessions: {
        [date]: {
          start: new Date(2026, 10, 2, 9, 30).getTime(),
          end: new Date(2026, 10, 2, 11, 30).getTime(),
        },
      },
      leaves: { [date]: [leave(date, '09:00', '12:00', 0)] },
    })
    const day = computeDayEarnings(date, 200, settings, data, now)
    // 出勤 0,但带薪假补回 180 分钟
    expect(day.workedMinutes).toBe(0)
    expect(day.leavePaidMinutes).toBe(180)
    expect(day.creditedMinutes).toBe(180)
    expect(day.earned).toBeCloseTo(200 * 3, 6)
  })
})

describe('月度计薪口径', () => {
  // 11 月共 21 个工作日,每天 450 分钟 = 157.5 小时
  const now = new Date(2026, 10, 30, 23, 59)

  it('本月工资 = 计入工时 / 排班工时 × 月薪', () => {
    const settings = makeSettings({
      monthlySalary: 31500,
      leaves: { '2026-11-02': [leave('2026-11-02', '09:00', '18:00', 100)] },
    })
    const result = computeEarnings(2026, 11, { settings, data, now })
    expect(result.scheduledHours).toBeCloseTo(157.5, 6)
    expect(result.hourlyRate).toBeCloseTo(200, 6)
    // 请假一天扣掉 7.5 小时,y = 157.5 - 7.5 = 150
    expect(result.leaveHours).toBeCloseTo(7.5, 6)
    expect(result.leaveDeductedHours).toBeCloseTo(7.5, 6)
    expect(result.creditedHours).toBeCloseTo(150, 6)
    expect(result.leaveDeduction).toBeCloseTo(1500, 6)
    expect(result.earnedTotal).toBeCloseTo(30000, 6)
    expect(result.monthCap).toBeCloseTo(30000, 6)
  })

  it('请假不会减少计薪分母', () => {
    const withoutLeave = computeEarnings(2026, 11, {
      settings: makeSettings({ monthlySalary: 31500 }),
      data,
      now,
    })
    const withLeave = computeEarnings(2026, 11, {
      settings: makeSettings({
        monthlySalary: 31500,
        leaves: { '2026-11-02': [leave('2026-11-02', '09:00', '18:00', 100)] },
      }),
      data,
      now,
    })
    expect(withLeave.scheduledHours).toBeCloseTo(withoutLeave.scheduledHours, 6)
    expect(withoutLeave.earnedTotal).toBeCloseTo(31500, 6)
    expect(withLeave.earnedTotal).toBeCloseTo(30000, 6)
  })

  it('扣 50% 时只扣一半', () => {
    const settings = makeSettings({
      monthlySalary: 31500,
      leaves: { '2026-11-02': [leave('2026-11-02', '09:00', '18:00', 50)] },
    })
    const result = computeEarnings(2026, 11, { settings, data, now })
    expect(result.leaveDeductedHours).toBeCloseTo(3.75, 6)
    expect(result.creditedHours).toBeCloseTo(153.75, 6)
    expect(result.earnedTotal).toBeCloseTo(30750, 6)
  })

  it('休息日请假不计入工时与工资', () => {
    const settings = makeSettings({
      monthlySalary: 31500,
      // 11-07 是周六,不上班
      leaves: { '2026-11-07': [leave('2026-11-07', '09:00', '18:00', 100)] },
    })
    const result = computeEarnings(2026, 11, { settings, data, now })
    expect(result.leaveHours).toBe(0)
    expect(result.leaveCount).toBe(0)
    expect(result.earnedTotal).toBeCloseTo(31500, 6)
  })
})
