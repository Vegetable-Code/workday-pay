import { computed, reactive, watch } from 'vue'
import type { SessionState, Settings, TimeSlot, Weekday } from '@/core/types'
import { isValidSlot, slotBounds, takeLeadingHours } from '@/core/timeslots'
import { DEFAULT_WORK_DAYS } from '@/core/calendar'
import { daySchedule } from '@/core/schedule'
import { toYmd } from '@/core/dates'
import { onStorageChange, readJson, writeJson } from '@/core/storage'
import { allHolidayData } from '@/data/holidays'

const STORAGE_KEY = 'workday-pay:settings'
/** 打卡记录只保留最近 120 天 */
const SESSION_KEEP_DAYS = 120
/** 五点五天:周六按基础时段的前 3 小时折算半天 */
const HALF_DAY_HOURS = 3

function defaultSettings(): Settings {
  return {
    monthlySalary: 15000,
    slots: [
      { id: 'slot-1', start: '09:00', end: '12:00' },
      { id: 'slot-2', start: '13:30', end: '18:00' },
    ],
    workDays: [...DEFAULT_WORK_DAYS],
    weeklyOverrides: {},
    startDate: '',
    sessions: {},
  }
}

/**
 * 归一化每周上班的星期几。
 * 旧数据没有这个字段时按双休处理;合法的空数组(一周都不上班)予以保留。
 */
function normalizeWorkDays(value: unknown): Weekday[] {
  if (!Array.isArray(value)) return [...DEFAULT_WORK_DAYS]
  const days: Weekday[] = []
  for (const item of value) {
    if (typeof item !== 'number') continue
    if (!Number.isInteger(item) || item < 0 || item > 6) continue
    const weekday = item as Weekday
    if (!days.includes(weekday)) days.push(weekday)
  }
  return days.sort((a, b) => a - b)
}

function pruneSessions(sessions: Record<string, SessionState>): Record<string, SessionState> {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - SESSION_KEEP_DAYS)
  const limit = toYmd(cutoff)
  const kept: Record<string, SessionState> = {}
  for (const [date, session] of Object.entries(sessions)) {
    if (date >= limit) kept[date] = session
  }
  return kept
}

function loadSettings(): Settings {
  const parsed = readJson<Partial<Settings> | null>(STORAGE_KEY, null)
  if (!parsed || typeof parsed !== 'object') return defaultSettings()
  try {
    const base = defaultSettings()
    return {
      monthlySalary:
        typeof parsed.monthlySalary === 'number' &&
        Number.isFinite(parsed.monthlySalary) &&
        parsed.monthlySalary >= 0
          ? parsed.monthlySalary
          : base.monthlySalary,
      slots: Array.isArray(parsed.slots) && parsed.slots.length > 0 ? parsed.slots : base.slots,
      workDays: normalizeWorkDays(parsed.workDays),
      weeklyOverrides: parsed.weeklyOverrides ?? {},
      startDate: typeof parsed.startDate === 'string' ? parsed.startDate : base.startDate,
      sessions: pruneSessions(parsed.sessions ?? {}),
    }
  } catch {
    return defaultSettings()
  }
}

export const settings = reactive<Settings>(loadSettings())

watch(
  settings,
  (value) => {
    writeJson(STORAGE_KEY, value)
  },
  { deep: true },
)

export const validSlots = computed(() => settings.slots.filter(isValidSlot))

/**
 * 其他标签页改动设置时同步过来。
 * 没有这一步时,两个标签页会互相覆盖对方刚保存的数据。
 */
onStorageChange(STORAGE_KEY, () => {
  Object.assign(settings, loadSettings())
})

export function updateSalary(value: number): void {
  settings.monthlySalary = Number.isFinite(value) && value >= 0 ? value : 0
}

export function addSlot(): void {
  settings.slots.push({
    id: `slot-${Date.now()}-${settings.slots.length}`,
    start: '09:00',
    end: '12:00',
  })
}

export function removeSlot(id: string): void {
  settings.slots = settings.slots.filter((slot) => slot.id !== id)
}

export function updateSlot(id: string, patch: Partial<TimeSlot>): void {
  const slot = settings.slots.find((item) => item.id === id)
  if (slot) Object.assign(slot, patch)
}

export function setWeekdayOverride(weekday: Weekday, slots: TimeSlot[] | null): void {
  if (slots === null) {
    delete settings.weeklyOverrides[weekday]
  } else {
    settings.weeklyOverrides[weekday] = slots
  }
}

/** 设置某个星期是否上班 */
export function setWorkDay(weekday: Weekday, work: boolean): void {
  const days = new Set(settings.workDays)
  if (work) {
    days.add(weekday)
  } else {
    days.delete(weekday)
  }
  settings.workDays = [...days].sort((a, b) => a - b)
}

export type WeekPreset = 'double' | 'single' | 'fiveHalf'

/** 应用常见的每周上班安排:双休 / 单休 / 五点五天 */
export function applyWeekPreset(preset: WeekPreset): void {
  if (preset === 'double') {
    settings.workDays = [1, 2, 3, 4, 5]
    setWeekdayOverride(6, null)
    setWeekdayOverride(0, null)
    return
  }
  settings.workDays = [1, 2, 3, 4, 5, 6]
  if (preset === 'single') {
    setWeekdayOverride(6, null)
    return
  }
  // 五点五天:周六按基础时段的前 3 小时折算半天
  setWeekdayOverride(6, takeLeadingHours(settings.slots, HALF_DAY_HOURS))
}

export function setStartDate(value: string): void {
  settings.startDate = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : ''
}

/** 开始计时:未打卡则新建,已收工则继续 */
export function clockIn(now: Date): void {
  const date = toYmd(now)
  const existing = settings.sessions[date]
  if (existing) {
    existing.end = null
    return
  }
  settings.sessions[date] = { start: now.getTime(), end: null }
}

/**
 * 收工:冻结今天的计时。
 * 今天还没手动打过卡时(自动补卡中),以当天第一个时段的起点作为计时起点补一条记录。
 */
export function clockOut(now: Date): void {
  const date = toYmd(now)
  const session = settings.sessions[date]
  if (session) {
    if (session.end !== null) return
    session.end = now.getTime()
    return
  }

  const slots = daySchedule(date, settings, allHolidayData()).slots
  const bounds = slotBounds(slots)
  if (!bounds) return
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const start = dayStart + bounds.first * 60_000
  const end = Math.min(now.getTime(), dayStart + bounds.last * 60_000)
  settings.sessions[date] = { start, end: Math.max(start, end) }
}

export function clearSession(date: string): void {
  delete settings.sessions[date]
}

export function resetSettings(): void {
  Object.assign(settings, defaultSettings())
}
