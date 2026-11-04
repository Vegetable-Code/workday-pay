import { describe, expect, it } from 'vitest'
import { clampSelectedDate, defaultView, sanitizeView } from '../src/core/view'

const NOW = new Date(2026, 10, 4)

describe('默认视图', () => {
  it('指向当前月份与今天', () => {
    expect(defaultView(NOW)).toEqual({
      year: 2026,
      month: 11,
      selectedDate: '2026-11-04',
    })
  })
})

describe('视图状态收敛', () => {
  it('空数据回退到当前月份', () => {
    expect(sanitizeView(null, NOW)).toEqual(defaultView(NOW))
    expect(sanitizeView(undefined, NOW)).toEqual(defaultView(NOW))
    expect(sanitizeView('abc', NOW)).toEqual(defaultView(NOW))
  })

  it('保留合法的年月与选中日期', () => {
    expect(sanitizeView({ year: 2026, month: 10, selectedDate: '2026-10-15' }, NOW)).toEqual({
      year: 2026,
      month: 10,
      selectedDate: '2026-10-15',
    })
  })

  it('非法年月回退到当前值', () => {
    expect(sanitizeView({ year: 1999, month: 13 }, NOW).year).toBe(2026)
    expect(sanitizeView({ year: 1999, month: 13 }, NOW).month).toBe(11)
    expect(sanitizeView({ year: 2026.5, month: 0 }, NOW).month).toBe(11)
  })

  it('选中日期跨月时沿用日号', () => {
    expect(sanitizeView({ year: 2026, month: 11, selectedDate: '2026-10-15' }, NOW).selectedDate).toBe(
      '2026-11-15',
    )
  })
})

describe('选中日期收敛', () => {
  it('同月日期原样保留', () => {
    expect(clampSelectedDate(2026, 10, '2026-10-15')).toBe('2026-10-15')
  })

  it('月末不足时取当月最后一天', () => {
    expect(clampSelectedDate(2026, 2, '2026-01-31')).toBe('2026-02-28')
  })

  it('非法日期退回当月 1 号', () => {
    expect(clampSelectedDate(2026, 10, 'not-a-date')).toBe('2026-10-01')
    expect(clampSelectedDate(2026, 10, undefined)).toBe('2026-10-01')
  })
})
