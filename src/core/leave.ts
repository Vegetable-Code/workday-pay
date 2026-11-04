import type { LeaveKind, LeaveRecord, TimeSlot } from './types'
import {
  mergeRanges,
  timeFromMinutes,
  toSlotRange,
  type SlotRange,
} from './timeslots'

export const LEAVE_KIND_LABELS: Record<LeaveKind, string> = {
  personal: '事假',
  sick: '病假',
  annual: '年假',
  inLieu: '调休',
  marriage: '婚假',
  maternity: '产假',
  other: '其他',
}

export function leaveKindLabel(kind: string): string {
  return LEAVE_KIND_LABELS[kind as LeaveKind] ?? LEAVE_KIND_LABELS.other
}

/** 判断是否为已知的请假类型 */
export function isLeaveKind(value: unknown): value is LeaveKind {
  return typeof value === 'string' && value in LEAVE_KIND_LABELS
}

/**
 * 扣薪百分比收敛到 0~100。
 * 非法数值按全额扣除处理,避免请假记录被篡改后反而多发工资。
 */
export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 100
  const rounded = Math.round(value)
  if (rounded <= 0) return 0
  if (rounded >= 100) return 100
  return rounded
}

/** 单条请假对应的时间区间 */
export function leaveRange(record: LeaveRecord): SlotRange | null {
  return toSlotRange({ id: record.id, start: record.start, end: record.end })
}

/** 合并重叠的请假区间,用于整体展示 */
export function leaveRanges(records: LeaveRecord[]): SlotRange[] {
  const ranges: SlotRange[] = []
  for (const record of records) {
    const range = leaveRange(record)
    if (range) ranges.push(range)
  }
  return mergeRanges(ranges)
}

export interface LeaveComputation {
  /** 与排班重叠的请假总时长(分钟) */
  total: number
  /** 按扣薪百分比折算后被扣掉的等效时长(分钟) */
  deducted: number
  /** 请假中仍然带薪的时长(分钟) */
  paid: number
  /** 与排班有重叠的请假条数 */
  count: number
}

interface Segment {
  start: number
  end: number
  /** 该片段是否落在排班内 */
  inSchedule: boolean
  /** 该片段是否被请假覆盖 */
  covered: boolean
  /** 该片段适用的扣薪百分比 */
  percent: number
}

function scheduleRanges(slots: TimeSlot[]): SlotRange[] {
  const ranges: SlotRange[] = []
  for (const slot of slots) {
    const range = toSlotRange(slot)
    if (range) ranges.push(range)
  }
  return mergeRanges(ranges)
}

/**
 * 把排班与请假切成最小片段。
 *
 * 片段的边界全部来自排班与请假的端点,因此每个片段要么完整落在排班内,
 * 要么完整落在排班外;要么被某条请假完整覆盖,要么完全没有被覆盖。
 * 这样就不需要处理"部分重叠"的重复计数问题。
 */
function splitSegments(slots: TimeSlot[], records: LeaveRecord[]): Segment[] {
  const schedule = scheduleRanges(slots)
  const leaves: Array<{ range: SlotRange; percent: number }> = []
  for (const record of records) {
    const range = leaveRange(record)
    if (range) leaves.push({ range, percent: clampPercent(record.deductPercent) })
  }

  const points = new Set<number>()
  for (const range of schedule) {
    points.add(range.start)
    points.add(range.end)
  }
  for (const item of leaves) {
    points.add(item.range.start)
    points.add(item.range.end)
  }

  const sorted = [...points].sort((a, b) => a - b)
  const segments: Segment[] = []
  for (let index = 0; index < sorted.length - 1; index += 1) {
    const start = sorted[index] ?? 0
    const end = sorted[index + 1] ?? 0
    if (end <= start) continue
    const inSchedule = schedule.some((range) => range.start <= start && range.end >= end)
    let percent = 0
    let covered = false
    for (const item of leaves) {
      if (item.range.start > start || item.range.end < end) continue
      covered = true
      // 多条请假重叠时取扣得最多的那条
      percent = Math.max(percent, item.percent)
    }
    segments.push({ start, end, inSchedule, covered, percent })
  }
  return segments
}

/**
 * 请假时长统计。
 *
 * - total 只统计与排班重叠的部分,休息时间不扣钱;
 * - deducted = Σ(重叠分钟 × 扣薪百分比),即被扣掉的等效工时;
 * - paid = total - deducted,是仍然发工资的那部分。
 */
export function leaveComputation(records: LeaveRecord[], slots: TimeSlot[]): LeaveComputation {
  let total = 0
  let deducted = 0
  let paid = 0
  const covered = new Set<LeaveRecord>()
  for (const segment of splitSegments(slots, records)) {
    if (!segment.inSchedule || !segment.covered) continue
    const minutes = segment.end - segment.start
    total += minutes
    deducted += (minutes * segment.percent) / 100
    paid += (minutes * (100 - segment.percent)) / 100
  }
  for (const record of records) {
    const range = leaveRange(record)
    if (!range) continue
    const overlap = slots.some((slot) => {
      const slotRange = toSlotRange(slot)
      if (!slotRange) return false
      return slotRange.start < range.end && slotRange.end > range.start
    })
    if (overlap) covered.add(record)
  }
  return { total, deducted, paid, count: covered.size }
}

/**
 * 截至 cutoffMinutes(从午夜起的分钟数)的带薪请假分钟数。
 *
 * 一天里的带薪请假按时间流逝逐步计入,今天只算到当前时刻,
 * 过去的日子算满一整天,未来的日子一分都还没开始。
 */
export function leavePaidMinutesUntil(
  records: LeaveRecord[],
  slots: TimeSlot[],
  cutoffMinutes: number,
): number {
  let paid = 0
  for (const segment of splitSegments(slots, records)) {
    if (!segment.inSchedule || !segment.covered) continue
    const minutes = Math.min(segment.end, cutoffMinutes) - segment.start
    if (minutes <= 0) continue
    paid += (minutes * (100 - segment.percent)) / 100
  }
  return paid
}

/**
 * 从排班时段里挖掉请假时段,得到当天真正需要出勤的时段。
 * 全天请假时返回空数组。
 */
export function workSlotsAfterLeave(slots: TimeSlot[], records: LeaveRecord[]): TimeSlot[] {
  if (records.length === 0) return slots
  const result: TimeSlot[] = []
  for (const segment of splitSegments(slots, records)) {
    if (!segment.inSchedule || segment.covered) continue
    result.push({
      id: `work-${segment.start}-${segment.end}`,
      start: timeFromMinutes(segment.start),
      end: timeFromMinutes(segment.end),
    })
  }
  return result
}

/** 请假记录的时间描述,例如 "09:00-12:00" */
export function leaveMinutesText(record: LeaveRecord): string {
  return `${record.start}-${record.end}`
}

/** 请假记录的排序键,按开始时间先后排列 */
export function leaveSortKey(record: LeaveRecord): number {
  const range = leaveRange(record)
  return range ? range.start : Number.MAX_SAFE_INTEGER
}

/** 生成一条请假记录的默认标识 */
export function newLeaveId(): string {
  return `leave-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}
