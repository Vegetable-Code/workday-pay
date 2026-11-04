import { describe, expect, it } from 'vitest'
import type { SessionState, TimeSlot } from '../src/core/types'
import {
  effectiveWork,
  elapsedSeconds,
  formatDuration,
  sessionActionLabel,
  sessionView,
} from '../src/core/session'

const SLOTS: TimeSlot[] = [
  { id: 'a', start: '09:00', end: '12:00' },
  { id: 'b', start: '13:30', end: '18:00' },
]

const DATE = '2026-11-02'

function at(hour: number, minute = 0): Date {
  return new Date(2026, 10, 2, hour, minute)
}

function session(
  startHour: number,
  startMinute = 0,
  endHour?: number,
  endMinute = 0,
): SessionState {
  const start = at(startHour, startMinute)
  const end = endHour === undefined ? null : at(endHour, endMinute).getTime()
  return { start: start.getTime(), end }
}

describe('打卡相位', () => {
  it('还没到上班时间时提示待打卡', () => {
    const view = sessionView(DATE, undefined, SLOTS, at(8))
    expect(view.phase).toBe('notStarted')
    expect(view.active).toBe(false)
    expect(view.from).toBeNull()
    expect(view.action).toBe('开始赚钱')
    expect(view.intent).toBe('clockIn')
  })

  it('到点后自动收工并禁用按钮', () => {
    const view = sessionView(DATE, undefined, SLOTS, at(18, 30))
    expect(view.phase).toBe('autoClosed')
    expect(view.active).toBe(false)
    expect(view.action).toBe('今日已收工')
    expect(view.actionable).toBe(false)
    expect(view.to).toBe(18 * 60)
  })

  it('手动打卡后处于工作时段内为上班中', () => {
    const view = sessionView(DATE, session(8), SLOTS, at(10))
    expect(view.phase).toBe('working')
    expect(view.from).toBe(480)
    expect(view.to).toBe(600)
    expect(view.action).toBe('收工')
    expect(view.intent).toBe('clockOut')
  })

  it('手动打卡但还没到上班时间为待上班', () => {
    const view = sessionView(DATE, session(8), SLOTS, at(8, 30))
    expect(view.phase).toBe('waiting')
    expect(view.active).toBe(true)
    expect(view.intent).toBe('clockOut')
  })

  it('午休时段为休息中', () => {
    const view = sessionView(DATE, session(8), SLOTS, at(12, 30))
    expect(view.phase).toBe('break')
  })

  it('已收工为已收工并保留起止时间', () => {
    const view = sessionView(DATE, session(9, 0, 10, 30), SLOTS, at(15))
    expect(view.phase).toBe('stopped')
    expect(view.active).toBe(false)
    expect(view.from).toBe(540)
    expect(view.to).toBe(630)
    expect(view.action).toBe('继续上班')
  })

  it('没有排班时保持待打卡', () => {
    const view = sessionView(DATE, session(8), [], at(10))
    expect(view.phase).toBe('notStarted')
  })

  it('过去的日期按已收工展示', () => {
    const view = sessionView('2026-11-01', undefined, SLOTS, at(10))
    expect(view.phase).toBe('stopped')
    expect(view.to).toBe(18 * 60)
  })

  it('未来的日期没有计时', () => {
    const view = sessionView('2026-11-05', undefined, SLOTS, at(10))
    expect(view.phase).toBe('notStarted')
    expect(view.from).toBeNull()
  })
})

describe('自动补卡', () => {
  it('今天没打卡时从上班时刻起自动计时', () => {
    const view = sessionView(DATE, undefined, SLOTS, at(10))
    expect(view.phase).toBe('auto')
    expect(view.active).toBe(true)
    expect(view.from).toBe(9 * 60)
    expect(view.to).toBe(10 * 60)
    expect(view.action).toBe('收工')
  })

  it('有效区间为上班时刻到当前时刻', () => {
    const work = effectiveWork(DATE, undefined, SLOTS, at(10))
    expect(work.segments).toEqual([{ from: 540, to: 600, auto: true }])
    expect(work.autoFilled).toBe(true)
    expect(work.manual).toBe(false)
  })

  it('午休时段不产生新的有效区间', () => {
    const before = effectiveWork(DATE, undefined, SLOTS, at(12))
    const after = effectiveWork(DATE, undefined, SLOTS, at(12, 30))
    expect(before.segments).toEqual([{ from: 540, to: 720, auto: true }])
    expect(after.segments).toEqual([{ from: 540, to: 750, auto: true }])
  })

  it('下班后自动收工并按整日计', () => {
    const work = effectiveWork(DATE, undefined, SLOTS, at(20))
    expect(work.segments).toEqual([{ from: 540, to: 1080, auto: true }])
  })

  it('过去没有打卡记录的工作日按整日补发', () => {
    const work = effectiveWork('2026-11-01', undefined, SLOTS, at(10))
    expect(work.segments).toEqual([{ from: 540, to: 1080, auto: true }])
  })

  it('晚打卡时自动补上上班到打卡之间的时段', () => {
    const work = effectiveWork(DATE, session(10), SLOTS, at(11))
    expect(work.segments).toEqual([
      { from: 540, to: 600, auto: true },
      { from: 600, to: 660, auto: false },
    ])
    expect(work.autoFilled).toBe(true)
    expect(work.manual).toBe(true)
  })

  it('准点打卡时不会重复计算上班时段', () => {
    const work = effectiveWork(DATE, session(9), SLOTS, at(10))
    expect(work.segments).toEqual([{ from: 540, to: 600, auto: false }])
  })

  it('提前打卡只按工作时段计薪', () => {
    const work = effectiveWork(DATE, session(8), SLOTS, at(10))
    expect(work.segments).toEqual([{ from: 480, to: 600, auto: false }])
  })

  it('收工后区间冻结在收工时刻', () => {
    const work = effectiveWork(DATE, session(9, 0, 10, 30), SLOTS, at(15))
    expect(work.segments).toEqual([{ from: 540, to: 630, auto: false }])
  })
})

describe('按钮文案与计时', () => {
  it('按钮文案按相位区分', () => {
    expect(sessionActionLabel('notStarted')).toBe('开始赚钱')
    expect(sessionActionLabel('stopped')).toBe('继续上班')
    expect(sessionActionLabel('autoClosed')).toBe('今日已收工')
    expect(sessionActionLabel('auto')).toBe('收工')
    expect(sessionActionLabel('working')).toBe('收工')
    expect(sessionActionLabel('break')).toBe('收工')
    expect(sessionActionLabel('waiting')).toBe('收工')
  })

  it('未开始时计时为零', () => {
    const view = sessionView(DATE, undefined, SLOTS, at(8))
    expect(elapsedSeconds(view, at(10))).toBe(0)
  })

  it('自动计时时长从上班时刻算起', () => {
    const view = sessionView(DATE, undefined, SLOTS, at(10))
    expect(elapsedSeconds(view, at(10))).toBe(60 * 60)
    expect(formatDuration(elapsedSeconds(view, at(10)))).toBe('01:00:00')
  })

  it('收工后计时固定在打卡区间', () => {
    const view = sessionView(DATE, session(9, 0, 10, 30), SLOTS, at(15))
    expect(elapsedSeconds(view, at(15))).toBe(90 * 60)
    expect(formatDuration(elapsedSeconds(view, at(15)))).toBe('01:30:00')
  })

  it('秒数格式化为 HH:MM:SS', () => {
    expect(formatDuration(0)).toBe('00:00:00')
    expect(formatDuration(61)).toBe('00:01:01')
    expect(formatDuration(3661)).toBe('01:01:01')
  })
})
