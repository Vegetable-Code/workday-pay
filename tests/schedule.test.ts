import { describe, expect, it } from 'vitest'
import bundled from '../src/data/holidays.json'
import type { HolidayData, Settings } from '../src/core/types'
import { daySchedule, monthSchedule } from '../src/core/schedule'
import { takeLeadingHours } from '../src/core/timeslots'

const data = bundled as unknown as HolidayData

/** 每日排班 09:00-12:00 / 14:00-18:00,合计 420 分钟(7 小时) */
const SEVEN_HOUR_SLOTS = [
  { id: 'a', start: '09:00', end: '12:00' },
  { id: 'b', start: '14:00', end: '18:00' },
]

/** 周六按 3 小时折算半天 */
const HALF_SATURDAY = [{ id: 'half', start: '09:00', end: '12:00' }]

function makeSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    monthlySalary: 5000,
    slots: SEVEN_HOUR_SLOTS,
    workDays: [1, 2, 3, 4, 5],
    weeklyOverrides: {},
    startDate: '',
    sessions: {},
    ...overrides,
  }
}

describe('单日排班', () => {
  it('普通工作日使用每日默认时段', () => {
    // 2026-11-02 是周一
    const day = daySchedule('2026-11-02', makeSettings(), data)
    expect(day.kind).toBe('workday')
    expect(day.isWorkday).toBe(true)
    expect(day.scheduledMinutes).toBe(420)
    expect(day.slots).toHaveLength(2)
  })

  it('按星期覆盖生效时使用覆盖时段', () => {
    // 2026-11-07 是周六
    const day = daySchedule(
      '2026-11-07',
      makeSettings({
        workDays: [1, 2, 3, 4, 5, 6],
        weeklyOverrides: { 6: HALF_SATURDAY },
      }),
      data,
    )
    expect(day.isWorkday).toBe(true)
    expect(day.scheduledMinutes).toBe(180)
    expect(day.slots).toEqual(HALF_SATURDAY)
  })

  it('调休补班日按整天上班,忽略当天的星期覆盖', () => {
    // 2026-10-10 是周六,国庆节调休补班日
    const day = daySchedule(
      '2026-10-10',
      makeSettings({
        workDays: [1, 2, 3, 4, 5, 6],
        weeklyOverrides: { 6: HALF_SATURDAY },
      }),
      data,
    )
    expect(day.kind).toBe('makeup')
    expect(day.isWorkday).toBe(true)
    expect(day.scheduledMinutes).toBe(420)
  })

  it('法定假日与调休放假都没有排班', () => {
    const settings = makeSettings({ workDays: [1, 2, 3, 4, 5, 6] })
    const statutory = daySchedule('2026-10-05', settings, data)
    expect(statutory.kind).toBe('statutory')
    expect(statutory.isWorkday).toBe(false)
    expect(statutory.scheduledMinutes).toBe(0)
    expect(statutory.slots).toEqual([])

    const inLieu = daySchedule('2026-10-06', settings, data)
    expect(inLieu.kind).toBe('inLieu')
    expect(inLieu.isWorkday).toBe(false)
    expect(inLieu.scheduledMinutes).toBe(0)
  })

  it('按排班休息的工作日没有排班', () => {
    // 2026-11-08 是周日,单休时也要上班
    const off = daySchedule('2026-11-08', makeSettings(), data)
    expect(off.kind).toBe('weekend')
    expect(off.isWorkday).toBe(false)
    expect(off.scheduledMinutes).toBe(0)

    const workday = daySchedule(
      '2026-11-08',
      makeSettings({ workDays: [0, 1, 2, 3, 4, 5, 6] }),
      data,
    )
    expect(workday.isWorkday).toBe(true)
    expect(workday.scheduledMinutes).toBe(420)
  })
})

describe('整月排班', () => {
  it('双休时 10 月排班 126 小时', () => {
    const list = monthSchedule(2026, 10, makeSettings(), data)
    expect(list).toHaveLength(31)
    const hours = list.reduce((sum, day) => sum + day.scheduledMinutes, 0) / 60
    // 17 个工作日 + 10/10 调休补班,共 18 天 × 7 小时
    expect(hours).toBeCloseTo(126, 6)
  })

  it('五点五天时 10 月排班 135 小时', () => {
    const list = monthSchedule(
      2026,
      10,
      makeSettings({
        workDays: [1, 2, 3, 4, 5, 6],
        weeklyOverrides: { 6: HALF_SATURDAY },
      }),
      data,
    )
    const hours = list.reduce((sum, day) => sum + day.scheduledMinutes, 0) / 60
    // 17 个工作日 × 7 小时 + 补班日 × 7 小时 + 3 个周六 × 3 小时
    expect(hours).toBeCloseTo(135, 6)
  })

  it('排班不因入职日期变化', () => {
    const withoutStart = monthSchedule(2026, 10, makeSettings(), data)
    const withStart = monthSchedule(
      2026,
      10,
      makeSettings({ startDate: '2026-10-09' }),
      data,
    )
    expect(withStart.map((day) => day.scheduledMinutes)).toEqual(
      withoutStart.map((day) => day.scheduledMinutes),
    )
  })
})

describe('半天按小时折算', () => {
  it('取前 3 小时得到 09:00-12:00', () => {
    const result = takeLeadingHours(SEVEN_HOUR_SLOTS, 3)
    expect(result).toEqual([{ id: 'a-lead', start: '09:00', end: '12:00' }])
  })

  it('跨午休时按时间顺序拼接', () => {
    const slots = [
      { id: 'a', start: '09:00', end: '12:00' },
      { id: 'b', start: '13:00', end: '18:00' },
    ]
    const result = takeLeadingHours(slots, 4)
    expect(result).toEqual([
      { id: 'a-lead', start: '09:00', end: '12:00' },
      { id: 'b-lead', start: '13:00', end: '14:00' },
    ])
  })

  it('超出总时长时返回完整时段', () => {
    const result = takeLeadingHours(SEVEN_HOUR_SLOTS, 10)
    expect(result).toEqual([
      { id: 'a-lead', start: '09:00', end: '12:00' },
      { id: 'b-lead', start: '14:00', end: '18:00' },
    ])
  })
})
