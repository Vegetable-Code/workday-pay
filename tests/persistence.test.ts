import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { initStorage, readJson, removeKey, storageHealthy, writeJson } from '../src/core/storage'
import { toYmd } from '../src/core/dates'

class FakeStorage {
  private map = new Map<string, string>()

  get length(): number {
    return this.map.size
  }

  clear(): void {
    this.map.clear()
  }

  getItem(key: string): string | null {
    return this.map.get(key) ?? null
  }

  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null
  }

  removeItem(key: string): void {
    this.map.delete(key)
  }

  setItem(key: string, value: string): void {
    this.map.set(key, String(value))
  }
}

/** 模拟禁用存储的浏览器:写入直接抛错 */
class BlockedStorage extends FakeStorage {
  override setItem(): void {
    throw new Error('storage disabled')
  }
}

function install(storage: FakeStorage): void {
  Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    configurable: true,
    writable: true,
  })
}

/** 模拟浏览器环境:只保留存储事件监听需要的部分 */
class FakeWindow {
  private listeners = new Map<string, Set<(event: { key: string | null }) => void>>()

  addEventListener(type: string, listener: (event: { key: string | null }) => void): void {
    const group = this.listeners.get(type) ?? new Set()
    group.add(listener)
    this.listeners.set(type, group)
  }

  emit(type: string, key: string | null): void {
    for (const listener of this.listeners.get(type) ?? []) listener({ key })
  }
}

let fakeWindow: FakeWindow

/** n 天前的 "YYYY-MM-DD" */
function daysAgo(n: number): string {
  const date = new Date()
  date.setDate(date.getDate() - n)
  return toYmd(date)
}

beforeEach(() => {
  install(new FakeStorage())
  fakeWindow = new FakeWindow()
  Object.defineProperty(globalThis, 'window', {
    value: fakeWindow,
    configurable: true,
    writable: true,
  })
  storageHealthy.value = true
  vi.resetModules()
})

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'window')
})

describe('本地存储封装', () => {
  it('写入后能原样读回', () => {
    expect(writeJson('k', { a: 1 })).toBe(true)
    expect(readJson<{ a: number } | null>('k', null)).toEqual({ a: 1 })
  })

  it('键不存在时返回兜底值', () => {
    expect(readJson('missing', 'fallback')).toBe('fallback')
  })

  it('数据损坏时返回兜底值', () => {
    localStorage.setItem('broken', '{not json')
    expect(readJson('broken', 'fallback')).toBe('fallback')
  })

  it('写入失败时标记存储不可用', () => {
    install(new BlockedStorage())
    expect(writeJson('k', 1)).toBe(false)
    expect(storageHealthy.value).toBe(false)
  })

  it('探测到存储不可用时状态为异常', () => {
    install(new BlockedStorage())
    initStorage()
    expect(storageHealthy.value).toBe(false)
  })

  it('可以删除键', () => {
    writeJson('k', 1)
    removeKey('k')
    expect(readJson('k', null)).toBeNull()
  })
})

describe('设置持久化', () => {
  it('月薪与入职日期在重新加载后保留', async () => {
    const store = await import('../src/stores/settings')
    store.updateSalary(20000)
    store.setStartDate('2026-10-09')
    await nextTick()

    vi.resetModules()
    const reloaded = await import('../src/stores/settings')
    expect(reloaded.settings.monthlySalary).toBe(20000)
    expect(reloaded.settings.startDate).toBe('2026-10-09')
  })

  it('打卡记录在重新加载后保留', async () => {
    const store = await import('../src/stores/settings')
    store.clockIn(new Date(2026, 10, 4, 9, 0))
    await nextTick()

    vi.resetModules()
    const reloaded = await import('../src/stores/settings')
    expect(reloaded.settings.sessions['2026-11-04']?.start).toBe(
      new Date(2026, 10, 4, 9, 0).getTime(),
    )
  })

  it('旧数据缺少每周排班时按双休迁移', async () => {
    localStorage.setItem(
      'workday-pay:settings',
      JSON.stringify({
        monthlySalary: 5000,
        slots: [{ id: 'slot-1', start: '09:00', end: '12:00' }],
        weeklyOverrides: {},
        startDate: '2026-10-09',
        sessions: {},
      }),
    )

    const store = await import('../src/stores/settings')
    expect(store.settings.workDays).toEqual([1, 2, 3, 4, 5])
    expect(store.settings.monthlySalary).toBe(5000)
    expect(store.settings.startDate).toBe('2026-10-09')
  })

  it('每周排班的星期与时段覆盖在重新加载后保留', async () => {
    const store = await import('../src/stores/settings')
    store.applyWeekPreset('fiveHalf')
    await nextTick()

    expect(store.settings.workDays).toEqual([1, 2, 3, 4, 5, 6])
    expect(store.settings.weeklyOverrides[6]).toEqual([
      { id: 'slot-1-lead', start: '09:00', end: '12:00' },
    ])

    vi.resetModules()
    const reloaded = await import('../src/stores/settings')
    expect(reloaded.settings.workDays).toEqual([1, 2, 3, 4, 5, 6])
    expect(reloaded.settings.weeklyOverrides[6]).toEqual([
      { id: 'slot-1-lead', start: '09:00', end: '12:00' },
    ])
  })
})

describe('视图持久化', () => {
  it('查看的月份与选中日期在重新加载后保留', async () => {
    const store = await import('../src/stores/view')
    store.setViewMonth(2026, 10)
    store.selectViewDate('2026-10-15')
    await nextTick()

    vi.resetModules()
    const reloaded = await import('../src/stores/view')
    expect(reloaded.view.year).toBe(2026)
    expect(reloaded.view.month).toBe(10)
    expect(reloaded.view.selectedDate).toBe('2026-10-15')
  })
})

describe('请假持久化', () => {
  it('请假记录在重新加载后保留', async () => {
    const store = await import('../src/stores/settings')
    store.addLeave('2026-11-04', {
      start: '09:00',
      end: '12:00',
      kind: 'sick',
      deductPercent: 50,
    })
    await nextTick()

    vi.resetModules()
    const reloaded = await import('../src/stores/settings')
    const record = reloaded.settings.leaves['2026-11-04']?.[0]
    expect(record?.start).toBe('09:00')
    expect(record?.end).toBe('12:00')
    expect(record?.kind).toBe('sick')
    expect(record?.deductPercent).toBe(50)
  })

  it('修改请假后重新加载仍然生效', async () => {
    const store = await import('../src/stores/settings')
    const created = store.addLeave('2026-11-04', {
      start: '09:00',
      end: '12:00',
      kind: 'personal',
      deductPercent: 100,
    })
    store.updateLeave('2026-11-04', created!.id, { deductPercent: 0 })
    await nextTick()

    vi.resetModules()
    const reloaded = await import('../src/stores/settings')
    expect(reloaded.settings.leaves['2026-11-04']?.[0]?.deductPercent).toBe(0)
  })

  it('删除最后一条请假后不留空记录', async () => {
    const store = await import('../src/stores/settings')
    const created = store.addLeave('2026-11-04', {
      start: '09:00',
      end: '12:00',
      kind: 'personal',
      deductPercent: 100,
    })
    store.removeLeave('2026-11-04', created!.id)
    await nextTick()

    vi.resetModules()
    const reloaded = await import('../src/stores/settings')
    expect(reloaded.settings.leaves['2026-11-04']).toBeUndefined()
  })

  it('同一天可以存多条请假', async () => {
    const store = await import('../src/stores/settings')
    store.addLeave('2026-11-04', {
      start: '09:00',
      end: '10:00',
      kind: 'personal',
      deductPercent: 100,
    })
    store.addLeave('2026-11-04', {
      start: '13:30',
      end: '15:00',
      kind: 'sick',
      deductPercent: 50,
    })
    await nextTick()

    vi.resetModules()
    const reloaded = await import('../src/stores/settings')
    expect(reloaded.settings.leaves['2026-11-04']).toHaveLength(2)
  })

  it('结束时间不晚于开始时间时拒绝新增', async () => {
    const store = await import('../src/stores/settings')
    const created = store.addLeave('2026-11-04', {
      start: '12:00',
      end: '09:00',
      kind: 'personal',
      deductPercent: 100,
    })
    expect(created).toBeNull()
    expect(store.leavesOn('2026-11-04')).toHaveLength(0)
  })
})

describe('请假数据读取时的归一化', () => {
  it('丢弃损坏的请假记录', async () => {
    localStorage.setItem(
      'workday-pay:settings',
      JSON.stringify({
        monthlySalary: 5000,
        slots: [{ id: 'slot-1', start: '09:00', end: '12:00' }],
        leaves: {
          '2026-11-04': [
            { id: 'ok', start: '09:00', end: '12:00', kind: 'sick', deductPercent: 50 },
            { id: 'bad-range', start: '12:00', end: '09:00', kind: 'sick', deductPercent: 50 },
            { id: 'bad-time', start: '9:00', end: '12:00', kind: 'sick', deductPercent: 50 },
          ],
          'not-a-date': [{ id: 'x', start: '09:00', end: '12:00', kind: 'sick' }],
        },
      }),
    )

    const store = await import('../src/stores/settings')
    const records = store.leavesOn('2026-11-04')
    expect(records).toHaveLength(1)
    expect(records[0]?.id).toBe('ok')
    expect(records[0]?.kind).toBe('sick')
    expect(store.leavesOn('not-a-date')).toHaveLength(0)
  })

  it('未知类型回落为事假', async () => {
    localStorage.setItem(
      'workday-pay:settings',
      JSON.stringify({
        monthlySalary: 5000,
        slots: [{ id: 'slot-1', start: '09:00', end: '12:00' }],
        leaves: {
          '2026-11-04': [
            { id: 'weird', start: '09:00', end: '10:00', kind: 'unknown', deductPercent: 50 },
          ],
        },
      }),
    )

    const store = await import('../src/stores/settings')
    expect(store.leavesOn('2026-11-04')[0]?.kind).toBe('personal')
  })

  it('把扣薪百分比收敛到 0~100', async () => {
    localStorage.setItem(
      'workday-pay:settings',
      JSON.stringify({
        monthlySalary: 5000,
        slots: [{ id: 'slot-1', start: '09:00', end: '12:00' }],
        leaves: {
          '2026-11-04': [
            { id: 'high', start: '09:00', end: '10:00', kind: 'sick', deductPercent: 180 },
            { id: 'low', start: '11:00', end: '12:00', kind: 'sick', deductPercent: -20 },
            { id: 'missing', start: '13:00', end: '14:00', kind: 'sick' },
          ],
        },
      }),
    )

    const store = await import('../src/stores/settings')
    const records = store.leavesOn('2026-11-04')
    expect(records.find((item) => item.id === 'high')?.deductPercent).toBe(100)
    expect(records.find((item) => item.id === 'low')?.deductPercent).toBe(0)
    // 缺字段时按全额扣除处理
    expect(records.find((item) => item.id === 'missing')?.deductPercent).toBe(100)
  })

  it('超过保留期的请假记录被裁掉', async () => {
    const oldDate = daysAgo(500)
    const recentDate = daysAgo(10)
    localStorage.setItem(
      'workday-pay:settings',
      JSON.stringify({
        monthlySalary: 5000,
        slots: [{ id: 'slot-1', start: '09:00', end: '12:00' }],
        leaves: {
          [oldDate]: [
            { id: 'old', start: '09:00', end: '12:00', kind: 'sick', deductPercent: 100 },
          ],
          [recentDate]: [
            { id: 'recent', start: '09:00', end: '12:00', kind: 'sick', deductPercent: 100 },
          ],
        },
      }),
    )

    const store = await import('../src/stores/settings')
    expect(store.settings.leaves[oldDate]).toBeUndefined()
    expect(store.settings.leaves[recentDate]).toHaveLength(1)
  })
})

describe('跨标签页同步', () => {
  it('其他标签页改了设置后本页跟着更新', async () => {
    const store = await import('../src/stores/settings')
    store.updateSalary(12345)
    await nextTick()

    localStorage.setItem(
      'workday-pay:settings',
      JSON.stringify({
        monthlySalary: 8888,
        slots: [{ id: 'slot-1', start: '09:00', end: '12:00' }],
        weeklyOverrides: {},
        startDate: '2026-01-05',
        sessions: {},
      }),
    )
    fakeWindow.emit('storage', 'workday-pay:settings')

    expect(store.settings.monthlySalary).toBe(8888)
    expect(store.settings.startDate).toBe('2026-01-05')
  })

  it('其他标签页换了月份后本页跟着更新', async () => {
    const store = await import('../src/stores/view')
    store.setViewMonth(2026, 11)
    await nextTick()

    localStorage.setItem(
      'workday-pay:view',
      JSON.stringify({ year: 2026, month: 9, selectedDate: '2026-09-08' }),
    )
    fakeWindow.emit('storage', 'workday-pay:view')

    expect(store.view.month).toBe(9)
    expect(store.view.selectedDate).toBe('2026-09-08')
  })

  it('其他标签页加了请假后本页跟着更新', async () => {
    const store = await import('../src/stores/settings')
    expect(store.leavesOn('2026-11-04')).toHaveLength(0)

    localStorage.setItem(
      'workday-pay:settings',
      JSON.stringify({
        monthlySalary: 15000,
        slots: [{ id: 'slot-1', start: '09:00', end: '12:00' }],
        leaves: {
          '2026-11-04': [
            { id: 'l1', start: '09:00', end: '12:00', kind: 'sick', deductPercent: 100 },
          ],
        },
      }),
    )
    fakeWindow.emit('storage', 'workday-pay:settings')

    expect(store.leavesOn('2026-11-04')).toHaveLength(1)
    expect(store.leavesOn('2026-11-04')[0]?.deductPercent).toBe(100)
  })
})
