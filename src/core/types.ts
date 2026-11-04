export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6

export interface TimeSlot {
  id: string
  /** "HH:mm" */
  start: string
  /** "HH:mm" */
  end: string
}

export interface Settings {
  monthlySalary: number
  /** 每日工作时间段,段与段之间的空隙视为休息 */
  slots: TimeSlot[]
  /** 每周上班的星期几,0=周日…6=周六 */
  workDays: Weekday[]
  /** 按星期覆盖时段,键为 0(周日)~6(周六) */
  weeklyOverrides: Partial<Record<Weekday, TimeSlot[]>>
  /** 入职日期 "YYYY-MM-DD",空字符串表示不限 */
  startDate: string
  /** 打卡记录,键为日期 "YYYY-MM-DD" */
  sessions: Record<string, SessionState>
  /** 请假记录,键为日期 "YYYY-MM-DD" */
  leaves: Record<string, LeaveRecord[]>
}

export type LeaveKind =
  | 'personal'
  | 'sick'
  | 'annual'
  | 'inLieu'
  | 'marriage'
  | 'maternity'
  | 'other'

/** 一条请假记录,按时间段生效 */
export interface LeaveRecord {
  id: string
  /** 请假日期 "YYYY-MM-DD" */
  date: string
  /** 开始时间 "HH:mm" */
  start: string
  /** 结束时间 "HH:mm" */
  end: string
  kind: LeaveKind
  /** 扣除百分之多少的钱,0~100;0 表示带薪假 */
  deductPercent: number
  note?: string
}

/** 一天的打卡记录 */
export interface SessionState {
  /** 开始计时的时间戳(ms) */
  start: number
  /** 收工时间戳(ms),null 表示仍在计时 */
  end: number | null
}

export type DayKind =
  | 'workday'
  | 'makeup'
  | 'statutory'
  | 'inLieu'
  | 'weekend'
  /** 按每周排班休息的工作日(例如单休时的周日) */
  | 'off'
  | 'notStarted'

export interface DayInfo {
  date: string
  kind: DayKind
  /** 中文描述,如 "国庆节" / "调休补班" / "星期二" */
  name: string
  isWorkday: boolean
}

export interface HolidayYear {
  /** 假期区间内的休息日,值为节日中文名 */
  holidays: Record<string, string>
  /** 因调休而需要上班的日子(通常落在周末) */
  workdays: Record<string, string>
  /** 调休放假日(工作日放假,由补班抵消) */
  inLieu: Record<string, string>
}

export type HolidayData = Record<string, HolidayYear>

export interface EarningsResult {
  days: DayInfo[]
  workdays: string[]
  /** 当月工作日天数 */
  workdayCount: number
  /** 本月排班总工时(小时)—— 计薪分母 */
  scheduledHours: number
  /** 本月实际出勤工时(小时)—— 已排除请假时段 */
  workedHours: number
  /** 本月计入工资的工时(小时)—— 出勤工时 + 带薪请假工时 */
  creditedHours: number
  /** 本月请假工时(小时)—— 与排班重叠的部分 */
  leaveHours: number
  /** 本月因请假被扣除的等效工时(小时) */
  leaveDeductedHours: number
  /** 本月因请假扣除的钱 */
  leaveDeduction: number
  /** 本月请假条数(与排班有重叠的) */
  leaveCount: number
  /** 每小时工资 = 月薪 ÷ 排班总工时 */
  hourlyRate: number
  /** 折合日薪 = 月薪 ÷ 当月工作日天数 */
  dailyRate: number
  /** 入职日之前的工作日天数,只有入职当月会大于 0 */
  preOnboardingWorkdays: number
  /** 入职日之前的排班工时(小时) */
  preOnboardingHours: number
  /** 本月实发上限(已扣除入职日之前的工作日) */
  monthCap: number
  /** 已完整过完的工作日数量 */
  workedDays: number
  todayIsWorkday: boolean
  todayScheduledMinutes: number
  todayWorkedMinutes: number
  /** 今日计入工资的时长(出勤 + 带薪请假) */
  todayCreditedMinutes: number
  /** 今日是否已打卡开始计时 */
  todayClockedIn: boolean
  /** 今日已赚 */
  earnedToday: number
  /** 本月累计已赚 */
  earnedTotal: number
  /** 本月还可赚 */
  remaining: number
  /** 已赚占月薪比例 0~1 */
  ratio: number
  /** 本月已过去的自然日占比 */
  monthElapsedRatio: number
}
