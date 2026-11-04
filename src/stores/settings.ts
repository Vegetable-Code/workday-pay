import { computed, reactive, watch } from 'vue'
import type { LeaveRecord, SessionState, Settings, TimeSlot, Weekday } from '@/core/types'
import { isValidSlot, isValidTime, slotBounds, takeLeadingHours } from '@/core/timeslots'
import { DEFAULT_WORK_DAYS } from '@/core/calendar'
import { daySchedule } from '@/core/schedule'
import { toYmd } from '@/core/dates'
import { clampPercent, isLeaveKind, newLeaveId } from '@/core/leave'
import { onStorageChange, readJson, writeJson } from '@/core/storage'
import { allHolidayData } from '@/data/holidays'

const STORAGE_KEY = 'workday-pay:settings'
/** 打卡记录只保留最近 120 天 */
const SESSION_KEEP_DAYS = 120
/** 请假记录保留最近 400 天,足够覆盖跨年结算 */
const LEAVE_KEEP_DAYS = 400
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
    leaves: {},
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

function cutoffDate(days: number): string {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  return toYmd(cutoff)
}

/** 归一化单条请假记录,字段不合法就丢弃 */
function normalizeLeave(value: unknown, date: string): LeaveRecord | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Partial<LeaveRecord>
  if (typeof raw.start !== 'string' || typeof raw.end !== 'string') return null
  if (!isValidTime(raw.start) || !isValidTime(raw.end)) return null
  if (raw.start >= raw.end) return null
  const record: LeaveRecord = {
    id: typeof raw.id === 'string' && raw.id ? raw.id : newLeaveId(),
    date,
    start: raw.start,
    end: raw.end,
    kind: isLeaveKind(raw.kind) ? raw.kind : 'personal',
    deductPercent: clampPercent(Number(raw.deductPercent ?? 100)),
  }
  if (typeof raw.note === 'string' && raw.note) record.note = raw.note
  return record
}

function normalizeLeaves(value: unknown): Record<string, LeaveRecord[]> {
  if (!value || typeof value !== 'object') return {}
  const limit = cutoffDate(LEAVE_KEEP_DAYS)
  const out: Record<string, LeaveRecord[]> = {}
  for (const [date, list] of Object.entries(value as Record<string, unknown>)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
    if (date < limit) continue
    if (!Array.isArray(list)) continue
    const records: LeaveRecord[] = []
    for (const item of list) {
      const record = normalizeLeave(item, date)
      if (record) records.push(record)
    }
    if (records.length > 0) out[date] = records
  }
  return out
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
      leaves: normalizeLeaves(parsed.leaves ?? {}),
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

  const slots = daySchedule(date, settings, allHolidayData()).workSlots
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

/** 某一天的请假记录 */
export function leavesOn(date: string): LeaveRecord[] {
  return settings.leaves[date] ?? []
}

/** 新增一条请假记录 */
export function addLeave(
  date: string,
  input: { start: string; end: string; kind: LeaveRecord['kind']; deductPercent: number },
): LeaveRecord | null {
  if (!isValidTime(input.start) || !isValidTime(input.end)) return null
  if (input.start >= input.end) return null
  const record: LeaveRecord = {
    id: newLeaveId(),
    date,
    start: input.start,
    end: input.end,
    kind: input.kind,
    deductPercent: clampPercent(input.deductPercent),
  }
  const list = settings.leaves[date] ? [...settings.leaves[date]!] : []
  list.push(record)
  settings.leaves[date] = list
  return record
}

/** 修改一条请假记录 */
export function updateLeave(date: string, id: string, patch: Partial<LeaveRecord>): void {
  const list = settings.leaves[date]
  if (!list) return
  const current = list.find((record) => record.id === id)
  if (!current) return
  const next: LeaveRecord = { ...current, ...patch, id: current.id, date: current.date }
  if (!isValidTime(next.start) || !isValidTime(next.end) || next.start >= next.end) return
  next.deductPercent = clampPercent(next.deductPercent)
  settings.leaves[date] = list.map((record) => (record.id === id ? next : record))
}

/** 删除一条请假记录 */
export function removeLeave(date: string, id: string): void {
  const list = settings.leaves[date]
  if (!list) return
  const next = list.filter((record) => record.id !== id)
  if (next.length > 0) {
    settings.leaves[date] = next
  } else {
    delete settings.leaves[date]
  }
}

export function resetSettings(): void {
  Object.assign(settings, defaultSettings())
}
