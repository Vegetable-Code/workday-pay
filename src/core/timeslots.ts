import type { TimeSlot, Weekday } from './types'
import { fromYmd } from './dates'

export interface SlotRange {
  start: number
  end: number
}

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/

export function isValidTime(value: string): boolean {
  return TIME_PATTERN.test(value)
}

export function isValidSlot(slot: TimeSlot): boolean {
  return isValidTime(slot.start) && isValidTime(slot.end) && slot.start < slot.end
}

export function toMinutes(value: string): number {
  const [hour, minute] = value.split(':').map(Number)
  return (hour ?? 0) * 60 + (minute ?? 0)
}

export function toSlotRange(slot: TimeSlot): SlotRange | null {
  if (!isValidSlot(slot)) return null
  return { start: toMinutes(slot.start), end: toMinutes(slot.end) }
}

/** 合并重叠或首尾相接的时段,避免重复计时 */
export function mergeRanges(ranges: SlotRange[]): SlotRange[] {
  const sorted = [...ranges].sort((a, b) => a.start - b.start)
  const merged: SlotRange[] = []
  for (const range of sorted) {
    const last = merged[merged.length - 1]
    if (last && range.start <= last.end) {
      last.end = Math.max(last.end, range.end)
    } else {
      merged.push({ ...range })
    }
  }
  return merged
}

function validRanges(slots: TimeSlot[]): SlotRange[] {
  const ranges: SlotRange[] = []
  for (const slot of slots) {
    const range = toSlotRange(slot)
    if (range) ranges.push(range)
  }
  return mergeRanges(ranges)
}

/** 当天最早的上班时刻与最晚的下班时刻(分钟),没有有效时段时为 null */
export function slotBounds(slots: TimeSlot[]): { first: number; last: number } | null {
  const ranges = validRanges(slots)
  const first = ranges[0]
  const last = ranges[ranges.length - 1]
  if (!first || !last) return null
  return { first: first.start, last: last.end }
}

/** 某一分钟是否落在有效工作时段内(午休、下班后为 false) */
export function isSlotMoment(slots: TimeSlot[], minutes: number): boolean {
  return validRanges(slots).some(
    (range) => minutes >= range.start && minutes < range.end,
  )
}

/** 一天内所有时段的总时长(分钟),忽略非法时段 */
export function totalSlotMinutes(slots: TimeSlot[]): number {
  return validRanges(slots).reduce((sum, range) => sum + (range.end - range.start), 0)
}

/** 截至 nowMinutes(从午夜起的分钟数)已经过去的有效工作分钟数 */
export function elapsedSlotMinutes(slots: TimeSlot[], nowMinutes: number): number {
  return validRanges(slots).reduce((sum, range) => {
    const overlap = Math.min(range.end, nowMinutes) - range.start
    return sum + Math.max(0, overlap)
  }, 0)
}

/** 计时区间 [from, to] 与工作时段重叠的分钟数 */
export function overlapSlotMinutes(
  slots: TimeSlot[],
  from: number,
  to: number,
): number {
  if (to <= from) return 0
  return validRanges(slots).reduce((sum, range) => {
    const overlap = Math.min(range.end, to) - Math.max(range.start, from)
    return sum + Math.max(0, overlap)
  }, 0)
}

/** 取某一天实际生效的时段:优先使用按星期的覆盖 */
export function slotsForDate(
  date: string,
  base: TimeSlot[],
  overrides: Partial<Record<Weekday, TimeSlot[]>>,
): TimeSlot[] {
  const weekday = fromYmd(date).getDay() as Weekday
  const override = overrides[weekday]
  return override && override.length > 0 ? override : base
}

export function sortSlots(slots: TimeSlot[]): TimeSlot[] {
  return [...slots].sort((a, b) => toMinutes(a.start) - toMinutes(b.start))
}

export function formatMinutes(minutes: number): string {
  const total = Math.max(0, Math.round(minutes))
  const hour = Math.floor(total / 60)
  const minute = total % 60
  return `${hour} 小时 ${padMinute(minute)} 分`
}

export function formatClock(minutes: number): string {
  const total = Math.max(0, Math.round(minutes))
  const hour = Math.floor(total / 60) % 24
  const minute = total % 60
  return `${padMinute(hour)}:${padMinute(minute)}`
}

/** 从午夜起经过 minutes 分钟后的 "HH:mm" */
export function timeFromMinutes(minutes: number): string {
  const total = ((Math.round(minutes) % 1440) + 1440) % 1440
  return `${padMinute(Math.floor(total / 60))}:${padMinute(total % 60)}`
}

/**
 * 取时段的面 hours 小时(半天按小时折算)。
 * 例:09:00-12:00 / 14:00-18:00 取前 3 小时 → 09:00-12:00。
 */
export function takeLeadingHours(slots: TimeSlot[], hours: number): TimeSlot[] {
  const limit = Math.max(0, Math.round(hours * 60))
  const result: TimeSlot[] = []
  let used = 0
  for (const slot of sortSlots(slots)) {
    if (used >= limit) break
    const range = toSlotRange(slot)
    if (!range) continue
    const take = Math.min(range.end - range.start, limit - used)
    result.push({
      id: `${slot.id}-lead`,
      start: slot.start,
      end: timeFromMinutes(range.start + take),
    })
    used += take
  }
  return result
}

function padMinute(value: number): string {
  return value < 10 ? `0${value}` : String(value)
}
