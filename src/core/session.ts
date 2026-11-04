import type { SessionState, TimeSlot } from './types'
import { minutesOfDay, minutesSinceMidnight, toYmd } from './dates'
import { isSlotMoment, slotBounds } from './timeslots'

export type SessionPhase =
  | 'notStarted'
  | 'waiting'
  | 'auto'
  | 'working'
  | 'break'
  | 'stopped'
  | 'autoClosed'

/** 点击按钮时的意图 */
export type ClockIntent = 'clockIn' | 'clockOut' | 'none'

export interface SessionView {
  phase: SessionPhase
  /** 计时起点(从午夜起的分钟数),未开始为 null */
  from: number | null
  /** 计时终点(从午夜起的分钟数) */
  to: number | null
  /** 状态文案 */
  label: string
  /** 是否正在计时 */
  active: boolean
  /** 按钮文案 */
  action: string
  /** 按钮点击意图 */
  intent: ClockIntent
  /** 按钮是否可点击 */
  actionable: boolean
}

export const SESSION_LABELS: Record<SessionPhase, string> = {
  notStarted: '待打卡',
  waiting: '待上班',
  auto: '自动计时中',
  working: '上班中',
  break: '休息中',
  stopped: '已收工',
  autoClosed: '今日已收工',
}

/** 一段有效的计时区间 */
export interface WorkSegment {
  from: number
  to: number
  /** 该段是否来自自动补卡 */
  auto: boolean
}

export interface EffectiveWork {
  /** 有效计时区间,按时间先后排列 */
  segments: WorkSegment[]
  /** 有效起点 */
  from: number | null
  /** 有效终点 */
  to: number | null
  /** 是否有手动打卡记录 */
  manual: boolean
  /** 收入中是否含有自动补卡的部分 */
  autoFilled: boolean
}

/**
 * 计算某一天的有效计时区间。
 *
 * 规则:
 * - 有打卡记录时,区间 = 自动补卡段[上班时刻 → 打卡时刻] + 手动段[打卡时刻 → 收工/当前]
 * - 今天没有打卡记录时,区间 = 自动补卡段[上班时刻 → min(当前, 下班时刻)]
 * - 过去的工作日没有打卡记录时按整日补发
 */
export function effectiveWork(
  date: string,
  session: SessionState | undefined,
  slots: TimeSlot[],
  now: Date,
): EffectiveWork {
  const empty: EffectiveWork = {
    segments: [],
    from: null,
    to: null,
    manual: false,
    autoFilled: false,
  }
  const bounds = slotBounds(slots)
  if (!bounds) return empty

  const { first, last } = bounds
  const today = toYmd(now)
  const nowMinutes = minutesSinceMidnight(now)

  if (!session) {
    // 未来的日期不计时
    if (date > today) return empty
    // 过去的工作日按整日补发
    if (date < today) {
      return {
        segments: [{ from: first, to: last, auto: true }],
        from: first,
        to: last,
        manual: false,
        autoFilled: true,
      }
    }
    // 今天没有打卡:从上班时刻起自动补卡,到点自动收工
    const to = Math.min(nowMinutes, last)
    if (to <= first) {
      return { ...empty, autoFilled: true }
    }
    return {
      segments: [{ from: first, to, auto: true }],
      from: first,
      to,
      manual: false,
      autoFilled: true,
    }
  }

  const manualStart = minutesOfDay(session.start)
  const manualEnd =
    session.end !== null
      ? minutesOfDay(session.end)
      : date < today
        ? last
        : Math.min(nowMinutes, last)

  const segments: WorkSegment[] = []
  // 自动补卡段:上班时刻到打卡时刻之间
  const autoTo = Math.min(manualStart, last)
  if (autoTo > first) {
    segments.push({ from: first, to: autoTo, auto: true })
  }
  // 手动计时段:打卡时刻到收工(或当前时刻)
  const manualTo = Math.min(manualEnd, last)
  if (manualTo > manualStart) {
    segments.push({ from: manualStart, to: manualTo, auto: false })
  }

  const firstSegment = segments[0]
  const lastSegment = segments[segments.length - 1]
  return {
    segments,
    from: firstSegment ? firstSegment.from : null,
    to: lastSegment ? lastSegment.to : null,
    manual: true,
    autoFilled: segments.some((segment) => segment.auto),
  }
}

/**
 * 计算某一天的打卡视图。
 * 今天没有打卡时按自动补卡计时,到点自动收工;手动打卡优先。
 */
export function sessionView(
  date: string,
  session: SessionState | undefined,
  slots: TimeSlot[],
  now: Date,
): SessionView {
  const today = toYmd(now)
  const isToday = date === today
  const isPast = date < today
  const bounds = slotBounds(slots)
  const nowMinutes = minutesSinceMidnight(now)

  // 未排班或未来的日期没有计时
  if (!bounds || (!isToday && !isPast)) {
    return makeView('notStarted', null, null, false, 'clockIn')
  }

  const { first, last } = bounds
  const sessionStart = session ? minutesOfDay(session.start) : null
  const start = sessionStart === null ? first : Math.min(first, sessionStart)

  // 手动收工
  if (session && session.end !== null) {
    const end = Math.min(minutesOfDay(session.end), last)
    return makeView('stopped', start, end, false, 'clockIn')
  }

  // 过去的日子没有收工记录:视为整天都在上班
  if (isPast) {
    return makeView('stopped', start, last, false, 'clockIn')
  }

  // 到点自动收工
  if (nowMinutes >= last) {
    return makeView('autoClosed', start, last, false, 'none')
  }

  // 手动打卡中
  if (sessionStart !== null) {
    if (nowMinutes < first) {
      return makeView('waiting', start, nowMinutes, true, 'clockOut')
    }
    const phase: SessionPhase = isSlotMoment(slots, nowMinutes) ? 'working' : 'break'
    return makeView(phase, start, nowMinutes, true, 'clockOut')
  }

  // 今天还没到上班时间
  if (nowMinutes < first) {
    return makeView('notStarted', null, null, false, 'clockIn')
  }

  // 自动补卡计时中
  return makeView('auto', first, nowMinutes, true, 'clockOut')
}

function makeView(
  phase: SessionPhase,
  from: number | null,
  to: number | null,
  active: boolean,
  intent: ClockIntent,
): SessionView {
  return {
    phase,
    from,
    to,
    label: SESSION_LABELS[phase],
    active,
    action: sessionActionLabel(phase),
    intent,
    actionable: intent !== 'none',
  }
}

/** 打卡按钮的文案 */
export function sessionActionLabel(phase: SessionPhase): string {
  switch (phase) {
    case 'notStarted':
      return '开始赚钱'
    case 'stopped':
      return '继续上班'
    case 'autoClosed':
      return '今日已收工'
    default:
      return '收工'
  }
}

/** 计时已进行的秒数 */
export function elapsedSeconds(view: SessionView, now: Date): number {
  if (view.from === null) return 0
  const end = view.to ?? minutesSinceMidnight(now)
  return Math.max(0, Math.round((end - view.from) * 60))
}

/** 秒数转 HH:MM:SS */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  const pad = (value: number) => (value < 10 ? `0${value}` : String(value))
  return `${pad(hours)}:${pad(minutes)}:${pad(secs)}`
}
