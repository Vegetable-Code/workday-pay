import { describe, expect, it } from 'vitest'
import type { TimeSlot } from '../src/core/types'
import {
  elapsedSlotMinutes,
  formatClock,
  formatMinutes,
  isValidSlot,
  isValidTime,
  slotsForDate,
  sortSlots,
  toMinutes,
  totalSlotMinutes,
} from '../src/core/timeslots'

function slot(id: string, start: string, end: string): TimeSlot {
  return { id, start, end }
}

const DAY = [slot('a', '09:00', '12:00'), slot('b', '13:30', '18:00')]

describe('时段校验', () => {
  it('接受合法时间', () => {
    expect(isValidTime('00:00')).toBe(true)
    expect(isValidTime('09:30')).toBe(true)
    expect(isValidTime('23:59')).toBe(true)
  })

  it('拒绝非法时间', () => {
    expect(isValidTime('24:00')).toBe(false)
    expect(isValidTime('9:00')).toBe(false)
    expect(isValidTime('09:60')).toBe(false)
    expect(isValidTime('')).toBe(false)
  })

  it('结束时间必须晚于开始时间', () => {
    expect(isValidSlot(slot('a', '09:00', '12:00'))).toBe(true)
    expect(isValidSlot(slot('a', '12:00', '12:00'))).toBe(false)
    expect(isValidSlot(slot('a', '18:00', '09:00'))).toBe(false)
  })
})

describe('时段时长', () => {
  it('累加多段时长', () => {
    expect(totalSlotMinutes(DAY)).toBe(180 + 270)
  })

  it('忽略非法时段', () => {
    expect(totalSlotMinutes([...DAY, slot('c', '18:00', '09:00')])).toBe(450)
  })

  it('空时段为 0', () => {
    expect(totalSlotMinutes([])).toBe(0)
  })
})

describe('已过时长', () => {
  it('上班前不算时长', () => {
    expect(elapsedSlotMinutes(DAY, 8 * 60)).toBe(0)
  })

  it('上午段内按分钟累计', () => {
    expect(elapsedSlotMinutes(DAY, 10 * 60 + 30)).toBe(90)
  })

  it('午休时段不计入', () => {
    expect(elapsedSlotMinutes(DAY, 12 * 60 + 30)).toBe(180)
  })

  it('下午段内继续累计', () => {
    expect(elapsedSlotMinutes(DAY, 15 * 60)).toBe(180 + 90)
  })

  it('下班后为全天时长', () => {
    expect(elapsedSlotMinutes(DAY, 23 * 60)).toBe(450)
  })

  it('跨段重叠部分只算一次', () => {
    const overlapping = [slot('a', '09:00', '12:00'), slot('b', '11:00', '14:00')]
    expect(elapsedSlotMinutes(overlapping, 11 * 60 + 30)).toBe(150)
  })
})

describe('按星期覆盖', () => {
  it('无覆盖时使用基础时段', () => {
    expect(slotsForDate('2026-11-03', DAY, {})).toEqual(DAY)
  })

  it('有覆盖时使用覆盖时段', () => {
    const override = [slot('x', '10:00', '16:00')]
    expect(slotsForDate('2026-11-07', DAY, { 6: override })).toEqual(override)
  })

  it('空数组视为无覆盖', () => {
    expect(slotsForDate('2026-11-07', DAY, { 6: [] })).toEqual(DAY)
  })
})

describe('格式化', () => {
  it('分钟转小时', () => {
    expect(formatMinutes(450)).toBe('7 小时 30 分')
    expect(formatMinutes(0)).toBe('0 小时 00 分')
  })

  it('分钟转时钟', () => {
    expect(formatClock(9 * 60 + 5)).toBe('09:05')
    expect(formatClock(0)).toBe('00:00')
  })

  it('按开始时间排序', () => {
    const sorted = sortSlots([slot('b', '13:30', '18:00'), slot('a', '09:00', '12:00')])
    expect(sorted.map((item) => item.id)).toEqual(['a', 'b'])
  })

  it('时间转分钟', () => {
    expect(toMinutes('09:30')).toBe(570)
  })
})
