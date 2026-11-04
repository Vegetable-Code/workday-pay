import { describe, expect, it } from 'vitest'
import bundled from '../src/data/holidays.json'
import type { HolidayData } from '../src/core/types'
import { describeDay, monthWorkdays } from '../src/core/calendar'

const data = bundled as unknown as HolidayData

describe('工作日判定', () => {
  it('普通工作日上班', () => {
    const day = describeDay('2026-11-03', data)
    expect(day.isWorkday).toBe(true)
    expect(day.kind).toBe('workday')
  })

  it('普通周末休息', () => {
    expect(describeDay('2026-11-07', data).isWorkday).toBe(false)
    expect(describeDay('2026-11-07', data).kind).toBe('weekend')
  })

  it('法定假日放假', () => {
    const day = describeDay('2026-10-01', data)
    expect(day.isWorkday).toBe(false)
    expect(day.kind).toBe('statutory')
    expect(day.name).toContain('国庆节')
  })

  it('周末调休补班要上班', () => {
    // 2026-02-14 周六,为春节调休补班日
    const day = describeDay('2026-02-14', data)
    expect(day.isWorkday).toBe(true)
    expect(day.kind).toBe('makeup')
  })

  it('周日调休补班也要上班', () => {
    // 2026-01-04 周日,为元旦调休补班日
    expect(describeDay('2026-01-04', data).isWorkday).toBe(true)
  })

  it('调休放假的工作日不上班', () => {
    // 2026-02-20 周五,春节调休放假
    const day = describeDay('2026-02-20', data)
    expect(day.isWorkday).toBe(false)
    expect(day.kind).toBe('inLieu')
  })
})

describe('每月工作日天数', () => {
  it('2026 年各月工作日天数符合实际安排', () => {
    // 依据《国务院办公厅关于2026年部分节假日安排的通知》(国办发明电〔2025〕7号)
    // 元旦 1/1-1/3 假、1/4 上班;春节 2/15-2/23 假、2/14 与 2/28 上班;
    // 清明 4/4-4/6 假;劳动节 5/1-5/5 假、5/9 上班;端午 6/19-6/21 假;
    // 中秋 9/25-9/27 假;国庆 10/1-10/7 假、9/20 与 10/10 上班。
    const expected: Record<number, number> = {
      1: 21,
      2: 16,
      3: 22,
      4: 21,
      5: 19,
      6: 21,
      7: 23,
      8: 21,
      9: 22,
      10: 18,
      11: 21,
      12: 23,
    }
    for (const [month, count] of Object.entries(expected)) {
      expect(monthWorkdays(2026, Number(month), data)).toHaveLength(count)
    }
  })

  it('2026 全年共 248 个工作日', () => {
    let total = 0
    for (let month = 1; month <= 12; month += 1) {
      total += monthWorkdays(2026, month, data).length
    }
    expect(total).toBe(248)
  })

  it('2025 年工作日天数与实际安排一致', () => {
    // 依据《国务院办公厅关于2025年部分节假日安排的通知》(国办发明电〔2024〕8号)
    expect(monthWorkdays(2025, 1, data)).toHaveLength(19)
    expect(monthWorkdays(2025, 2, data)).toHaveLength(19)
    expect(monthWorkdays(2025, 10, data)).toHaveLength(18)
  })

  it('2025 全年共 248 个工作日', () => {
    let total = 0
    for (let month = 1; month <= 12; month += 1) {
      total += monthWorkdays(2025, month, data).length
    }
    expect(total).toBe(248)
  })
})
