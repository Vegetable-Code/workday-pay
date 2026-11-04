<script setup lang="ts">
import { computed, ref } from 'vue'
import { useEarnings, useNow } from '@/composables/useEarnings'
import { clockIn, clockOut, settings } from '@/stores/settings'
import { selectViewDate, view } from '@/stores/view'
import { storageHealthy } from '@/core/storage'
import { toYmd, fromYmd, weekdayName } from '@/core/dates'
import { totalSlotMinutes } from '@/core/timeslots'
import { formatClock } from '@/core/timeslots'
import { computeDayEarnings } from '@/core/salary'
import { daySchedule } from '@/core/schedule'
import {
  formatDuration,
  sessionView,
} from '@/core/session'
import {
  formatClockTime,
  formatHours,
  formatMonthDay,
  formatMoney,
  formatPercent,
  formatYearMonth,
} from '@/core/format'
import EarningsDial from '@/components/EarningsDial.vue'
import TodayTimeline from '@/components/TodayTimeline.vue'
import MonthCalendar from '@/components/MonthCalendar.vue'
import StatCard from '@/components/StatCard.vue'
import SettingsDrawer from '@/components/SettingsDrawer.vue'
import ClockButton from '@/components/ClockButton.vue'
import LeaveEditor from '@/components/LeaveEditor.vue'
import { leaveRanges } from '@/core/leave'

const now = useNow()
const {
  holidayData,
  viewYear,
  viewMonth,
  result,
  isCurrentMonth,
  refreshHolidayData,
  shiftMonth,
  goToday,
} = useEarnings(now)

const today = computed(() => toYmd(now.value))
const nowMinutes = computed(() => now.value.getHours() * 60 + now.value.getMinutes())

const selectedDate = computed(() => view.selectedDate)
const drawerOpen = ref(false)

const selectedDay = computed(() =>
  result.value.days.find((day) => day.date === selectedDate.value) ?? null,
)

const todayDay = computed(() =>
  result.value.days.find((day) => day.date === today.value) ?? null,
)

const selectedSlots = computed(() => {
  if (!selectedDay.value) return []
  return daySchedule(selectedDate.value, settings, holidayData.value).slots
})

const selectedLeaveRanges = computed(() =>
  leaveRanges(settings.leaves[selectedDate.value] ?? []).map((range) => ({
    start: range.start,
    end: range.end,
  })),
)

const monthLeaveDates = computed(() =>
  result.value.days
    .filter((day) => (settings.leaves[day.date]?.length ?? 0) > 0)
    .map((day) => day.date),
)

const todaySlots = computed(() =>
  daySchedule(today.value, settings, holidayData.value).slots,
)

const session = computed(() =>
  sessionView(
    today.value,
    settings.sessions[today.value],
    todaySlots.value,
    now.value,
  ),
)

const selectedSession = computed(() =>
  sessionView(
    selectedDate.value,
    settings.sessions[selectedDate.value],
    selectedSlots.value,
    now.value,
  ),
)

const selectedEarnings = computed(() =>
  computeDayEarnings(
    selectedDate.value,
    result.value.hourlyRate,
    settings,
    holidayData.value,
    now.value,
  ),
)

const status = computed(() => {
  const earning = selectedEarnings.value
  if (selectedDay.value?.kind === 'notStarted') return { text: '未入职', tone: 'idle' as const }
  if (!earning.isWorkday) return { text: '休息日', tone: 'idle' as const }
  if (earning.state === 'past') return { text: '当日已结算', tone: 'done' as const }
  if (earning.state === 'future') return { text: '尚未开始', tone: 'idle' as const }
  if (earning.scheduledMinutes <= 0) return { text: '未排班', tone: 'idle' as const }
  return {
    text: selectedSession.value.label,
    tone: selectedSession.value.active ? ('active' as const) : ('idle' as const),
  }
})

const todayStatus = computed(() => {
  const earning = result.value
  if (todayDay.value?.kind === 'notStarted') return { text: '未入职', tone: 'idle' as const }
  if (!earning.todayIsWorkday) return { text: '今日休息', tone: 'idle' as const }
  switch (session.value.phase) {
    case 'auto':
      return { text: '自动计时中', tone: 'active' as const }
    case 'working':
      return { text: '上班中', tone: 'active' as const }
    case 'break':
      return { text: '休息中', tone: 'idle' as const }
    case 'waiting':
    case 'notStarted':
      return { text: '待上班', tone: 'idle' as const }
    case 'stopped':
    case 'autoClosed':
      return { text: '今日已收工', tone: 'done' as const }
  }
})

const dialStatus = computed(() => (isCurrentMonth.value ? todayStatus.value : status.value))

const dailyHours = computed(() => totalSlotMinutes(settings.slots) / 60)

/** 当月每个工作日平均排班多少小时(半天会让它小于每日默认工时) */
const averageDayHours = computed(() =>
  result.value.workdayCount > 0
    ? result.value.scheduledHours / result.value.workdayCount
    : dailyHours.value,
)

/** 入职日之前的工作日被扣除的金额 */
const onboardingDeduction = computed(
  () => result.value.preOnboardingHours * result.value.hourlyRate,
)

/** 落在周末的调休补班天数 */
const makeupWorkdayCount = computed(
  () => result.value.days.filter((day) => day.kind === 'makeup').length,
)

const workdayCountHint = computed(() => {
  return `${result.value.workdayCount} 个工作日 · 含调休补班 ${makeupWorkdayCount.value} 天 · 日均 ${formatHours(averageDayHours.value)} 小时`
})

/** 请假统计提示:条数、时长与折算成钱的扣款 */
const leaveHint = computed(() => {
  if (result.value.leaveCount === 0) return '本月没有请假记录'
  const paid = result.value.creditedHours - result.value.workedHours
  const parts = [
    `${result.value.leaveCount} 次 · ${formatHours(result.value.leaveHours)} 小时`,
    `扣 ¥${formatMoney(result.value.leaveDeduction)}`,
  ]
  if (paid > 0.0001) parts.push(`带薪 ${formatHours(paid)} 小时`)
  return parts.join(' · ')
})

const upcomingHolidays = computed(() =>
  result.value.days
    .filter(
      (day) =>
        day.date >= today.value &&
        !day.isWorkday &&
        day.kind !== 'weekend' &&
        day.kind !== 'notStarted',
    )
    .slice(0, 3),
)

const clockDisabled = computed(
  () =>
    !isCurrentMonth.value ||
    !result.value.todayIsWorkday ||
    result.value.workdayCount === 0 ||
    !session.value.actionable,
)

const clockAction = computed(() => session.value.action)

const clockHint = computed(() => {
  if (!isCurrentMonth.value) return '回到本月才能打卡计时'
  if (todayDay.value?.kind === 'notStarted') return '尚未入职,今天不计薪'
  if (!result.value.todayIsWorkday) return '今日不是工作日,没有工资增长'
  const view = session.value
  const earned = `已赚 ¥${formatMoney(result.value.earnedToday)}`
  switch (view.phase) {
    case 'notStarted':
      return '上班时间一到就自动开始计薪'
    case 'waiting':
      return '等待上班时间开始计时'
    case 'auto':
      return `自动计时中 · 自 ${formatClock(view.from ?? 0)} 起算 · ${earned}`
    case 'working':
      return `计时中 · ${earned}`
    case 'break':
      return `休息时段,暂不计工资 · ${earned}`
    case 'stopped':
      return `今日已收工 · ${earned}`
    case 'autoClosed':
      return `已到下班时间,自动收工 · ${earned}`
  }
})

const timelineEmptyText = computed(() => {
  if (selectedDay.value?.kind === 'notStarted') return '尚未入职,当日不计薪'
  return '当日不是工作日,没有工资增长'
})

const startDateLabel = computed(() =>
  settings.startDate ? settings.startDate.replace(/-/g, '/') : '未设置',
)

const startDateHint = computed(() => {
  if (!settings.startDate) return '未设置,所有月份均摊'
  const start = fromYmd(settings.startDate)
  const startMonth = new Date(start.getFullYear(), start.getMonth(), 1)
  const viewMonthStart = new Date(viewYear.value, viewMonth.value - 1, 1)
  if (viewMonthStart < startMonth) return '入职之前的月份不计薪'
  const preHours = result.value.preOnboardingHours
  if (preHours > 0) {
    return `入职前 ${formatHours(preHours)} 小时不计薪,本月扣 ¥${formatMoney(onboardingDeduction.value)}`
  }
  return '本月正常计薪'
})

const sessionLabel = computed(() => {
  if (!result.value.todayIsWorkday) return '休息日'
  return formatDuration(result.value.todayWorkedMinutes * 60)
})

const sessionHint = computed(() => {
  const earned = `今日已赚 ¥${formatMoney(result.value.earnedToday)}`
  if (session.value.phase === 'auto') return `${earned} · 自动补卡中`
  if (session.value.phase === 'autoClosed') return `${earned} · 到点自动收工`
  if (session.value.phase === 'stopped') return `${earned} · 今日已收工`
  return earned
})

function selectDate(date: string): void {
  selectViewDate(date)
}

function onDataUpdated(): void {
  refreshHolidayData()
}

function toggleClock(): void {
  if (clockDisabled.value) return
  if (session.value.intent === 'clockOut') {
    clockOut(now.value)
  } else {
    clockIn(now.value)
  }
}
</script>

<template>
  <div class="app">
    <header class="topbar panel">
      <div class="topbar__brand">
        <span class="topbar__mark" aria-hidden="true">薪</span>
        <div>
          <h1 class="topbar__title">上班计薪器</h1>
          <p class="topbar__sub">WORKDAY PAY METER</p>
        </div>
      </div>

      <div class="topbar__clock">
        <p class="topbar__date">
          {{ formatMonthDay(now) }} · {{ weekdayName(today) }}
        </p>
        <p class="topbar__time tabular">{{ formatClockTime(now) }}</p>
      </div>

      <div class="topbar__nav">
        <button class="topbar__arrow" type="button" aria-label="上一个月" @click="shiftMonth(-1)">‹</button>
        <span class="topbar__month tabular">{{ formatYearMonth(viewYear, viewMonth) }}</span>
        <button class="topbar__arrow" type="button" aria-label="下一个月" @click="shiftMonth(1)">›</button>
        <button v-if="!isCurrentMonth" class="topbar__today" type="button" @click="goToday">回到本月</button>
      </div>

      <button class="topbar__settings" type="button" @click="drawerOpen = true">
        <span aria-hidden="true">⚙</span>
        <span class="topbar__settings-text">设置</span>
      </button>
    </header>

    <p v-if="!storageHealthy" class="notice" role="alert">
      当前浏览器无法使用本地存储,设置与打卡记录不会被保留
    </p>

    <main class="layout">
      <section class="layout__main">
        <div class="panel panel--ticked hero">
          <div class="hero__dial">
            <EarningsDial
              :earned="result.earnedTotal"
              :ratio="result.ratio"
              :hourly-rate="result.hourlyRate"
              :status="dialStatus.text"
              :status-tone="dialStatus.tone"
            />
          </div>

          <div class="hero__info">
            <ClockButton
              :phase="session.phase"
              :action-label="clockAction"
              :hint="clockHint"
              :disabled="clockDisabled"
              @toggle="toggleClock"
            />

            <div class="hero__split">
              <div class="hero__cell">
                <p class="label">今日已赚</p>
                <p class="hero__figure tabular">¥{{ formatMoney(result.earnedToday) }}</p>
              </div>
              <div class="hero__cell">
                <p class="label">本月还可赚</p>
                <p class="hero__figure hero__figure--teal tabular">¥{{ formatMoney(result.remaining) }}</p>
              </div>
            </div>

            <p v-if="result.preOnboardingHours > 0" class="hero__note">
              入职日之前有 {{ formatHours(result.preOnboardingHours) }} 小时不计薪,本月实发上限
              ¥{{ formatMoney(result.monthCap) }}(已扣 ¥{{ formatMoney(onboardingDeduction) }})
            </p>
          </div>
        </div>

        <div class="panel panel--ticked panel--fill">
          <div class="panel__head">
            <h2 class="panel__title">
              {{ selectedDate === today ? '今日' : selectedDate.slice(5) }} 工作时段
            </h2>
            <span class="panel__badge">{{ selectedDay?.name ?? '' }}</span>
          </div>
          <div class="panel__body">
            <TodayTimeline
              :slots="selectedSlots"
              :now-minutes="nowMinutes"
              :worked-minutes="selectedEarnings.workedMinutes"
              :scheduled-minutes="selectedEarnings.scheduledMinutes"
              :is-workday="selectedEarnings.isWorkday"
              :session-from="selectedSession.from"
              :session-to="selectedSession.to"
              :leave-ranges="selectedLeaveRanges"
              :empty-text="timelineEmptyText"
            />

            <LeaveEditor
              :date="selectedDate"
              :slots="selectedSlots"
              :hourly-rate="result.hourlyRate"
              :is-workday="selectedEarnings.isWorkday"
            />
          </div>
        </div>
      </section>

      <aside class="layout__side">
        <div class="stats">
          <StatCard
            label="月薪基数"
            :value="formatMoney(settings.monthlySalary)"
            unit="元"
            :hint="`本月实发上限 ¥${formatMoney(result.monthCap)}`"
            tone="brass"
          />
          <StatCard
            label="本月排班"
            :value="formatHours(result.scheduledHours)"
            unit="小时"
            :hint="workdayCountHint"
          />
          <StatCard
            label="小时工资"
            :value="formatMoney(result.hourlyRate)"
            unit="元/小时"
            :hint="`月薪 ÷ ${formatHours(result.scheduledHours)} 小时`"
            tone="teal"
          />
          <StatCard
            label="已出勤"
            :value="formatHours(result.workedHours)"
            unit="小时"
            :hint="`本月自然日已过 ${formatPercent(result.monthElapsedRatio)}`"
          />
          <StatCard
            label="本月请假"
            :value="formatHours(result.leaveHours)"
            unit="小时"
            :hint="leaveHint"
            :tone="result.leaveCount > 0 ? 'brick' : 'default'"
          />
          <StatCard
            label="入职日期"
            :value="startDateLabel"
            :hint="startDateHint"
          />
          <StatCard
            label="今日工时"
            :value="sessionLabel"
            :hint="sessionHint"
            :tone="session.active ? 'teal' : 'default'"
          />
        </div>

        <div class="panel panel--ticked panel--fill">
          <div class="panel__head">
            <h2 class="panel__title">本月日历</h2>
            <span class="panel__badge">{{ result.workdayCount }} 个工作日</span>
          </div>
          <MonthCalendar
            :days="result.days"
            :today="today"
            :selected="selectedDate"
            :workday-count="result.workdayCount"
            :leave-dates="monthLeaveDates"
            @select="selectDate"
          />

          <div v-if="upcomingHolidays.length" class="holidays">
            <p class="label">本月假期</p>
            <ul class="holidays__list">
              <li v-for="day in upcomingHolidays" :key="day.date" class="holidays__item">
                <span class="holidays__date tabular">{{ day.date.slice(5) }}</span>
                <span class="holidays__name">{{ day.name }}</span>
              </li>
            </ul>
          </div>
        </div>
      </aside>
    </main>

    <SettingsDrawer
      :open="drawerOpen"
      :year="viewYear"
      @close="drawerOpen = false"
      @data-updated="onDataUpdated"
    />
  </div>
</template>

<style scoped>
.app {
  max-width: 1180px;
  margin: 0 auto;
  padding: var(--space-5) var(--space-4) var(--space-7);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.topbar {
  display: grid;
  grid-template-columns: auto 1fr auto auto;
  align-items: center;
  gap: var(--space-5);
  padding: var(--space-3) var(--space-4);
}

.topbar__brand {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.topbar__mark {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  background:
    linear-gradient(145deg, rgba(227, 178, 99, 0.24), rgba(227, 178, 99, 0.04)),
    var(--ink-900);
  color: var(--brass-300);
  font-size: 17px;
  font-weight: 600;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

.topbar__title {
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--ivory-100);
}

.topbar__sub {
  font-size: 9px;
  letter-spacing: 0.32em;
  color: var(--ivory-700);
}

.topbar__clock {
  text-align: center;
}

.topbar__date {
  font-size: 11px;
  color: var(--ivory-600);
}

.topbar__time {
  font-size: 19px;
  color: var(--brass-300);
  letter-spacing: 0.06em;
  line-height: 1.2;
}

.topbar__nav {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.topbar__arrow {
  width: 28px;
  height: 28px;
  border: 1px solid var(--line-soft);
  border-radius: var(--radius-xs);
  background: transparent;
  color: var(--ivory-400);
  font-size: 16px;
  line-height: 1;
  transition:
    color var(--dur-fast) var(--ease-out),
    border-color var(--dur-fast) var(--ease-out);
}

.topbar__arrow:hover {
  color: var(--brass-300);
  border-color: var(--line-strong);
}

.topbar__month {
  min-width: 82px;
  text-align: center;
  font-size: 13px;
  color: var(--ivory-100);
}

.topbar__today {
  padding: 5px 9px;
  border: 1px solid var(--line-soft);
  border-radius: var(--radius-xs);
  background: rgba(78, 198, 182, 0.1);
  color: var(--teal-300);
  font-size: 11px;
}

.topbar__settings {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-xs);
  background: rgba(227, 178, 99, 0.08);
  color: var(--brass-200);
  font-size: 12px;
  transition: background var(--dur-fast) var(--ease-out);
}

.topbar__settings:hover {
  background: rgba(227, 178, 99, 0.16);
}

.notice {
  padding: var(--space-2) var(--space-3);
  border: 1px solid rgba(217, 106, 78, 0.45);
  border-radius: var(--radius-xs);
  background: rgba(217, 106, 78, 0.12);
  color: var(--brick-300);
  font-size: 12px;
}

.layout {
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr);
  gap: var(--space-4);
  align-items: start;
}

.layout__main,
.layout__side {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  min-width: 0;
}

.hero {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: stretch;
  gap: var(--space-4);
}

.hero__dial {
  display: flex;
  align-items: center;
  justify-content: center;
}

.hero__info {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: var(--space-3);
  min-width: 0;
}

.hero__split {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
  padding-top: var(--space-3);
  border-top: 1px solid var(--line-faint);
}

.hero__cell {
  min-width: 0;
}

.hero__cell + .hero__cell {
  padding-left: var(--space-3);
  border-left: 1px solid var(--line-faint);
}

.hero__figure {
  margin-top: 4px;
  font-size: 17px;
  color: var(--brass-300);
}

.hero__figure--teal {
  color: var(--teal-300);
}

.hero__note {
  margin: 0;
  color: var(--ivory-600);
  font-size: 11px;
  line-height: 1.7;
}

.panel {
  padding: var(--space-4);
}

.panel__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
}

.panel__title {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.06em;
  color: var(--ivory-100);
}

.panel__badge {
  font-size: 11px;
  color: var(--ivory-600);
}

.panel__body {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-height: 0;
}

.stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-2);
}

.holidays {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin-top: var(--space-3);
  padding-top: var(--space-3);
  border-top: 1px solid var(--line-faint);
}

.holidays__list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.holidays__item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 3px 8px;
  border: 1px solid rgba(217, 106, 78, 0.35);
  border-radius: var(--radius-xs);
  background: rgba(217, 106, 78, 0.1);
}

.holidays__date {
  font-size: 12px;
  color: var(--brick-300);
}

.holidays__name {
  font-size: 12px;
  color: var(--ivory-400);
}

@media (max-width: 919px) {
  .layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .hero {
    grid-template-columns: minmax(0, 1fr);
  }

  .topbar {
    grid-template-columns: 1fr auto;
    gap: var(--space-3);
  }

  .topbar__clock {
    grid-column: 1 / -1;
    grid-row: 2;
    text-align: left;
  }

  .topbar__nav {
    grid-column: 1 / -1;
    grid-row: 3;
    justify-content: center;
  }
}

@media (min-width: 920px) {
  .app {
    height: 100dvh;
    padding: var(--space-4);
    gap: var(--space-3);
  }

  .layout {
    flex: 1 1 auto;
    min-height: 0;
    align-items: stretch;
  }

  .layout__main,
  .layout__side {
    min-height: 0;
    gap: var(--space-3);
  }

  .layout__main {
    container-type: size;
  }

  .hero {
    flex: 0 0 auto;
  }

  .panel--fill {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-height: 0;
    padding: var(--space-3);
  }

  .panel--fill .panel__head {
    margin-bottom: var(--space-2);
  }

  /* 时间轴与请假区并排,请假记录再多也不会把时间轴压扁 */
  .panel__body {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 288px;
    gap: var(--space-3);
    align-items: start;
  }

  .stats {
    flex: 0 0 auto;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 560px) {
  .app {
    padding: var(--space-3) var(--space-3) var(--space-6);
  }

  .stats {
    grid-template-columns: 1fr;
  }

  .hero__split {
    grid-template-columns: 1fr;
  }

  .hero__cell + .hero__cell {
    border-left: none;
    border-top: 1px solid var(--line-faint);
  }

  .topbar__settings-text {
    display: none;
  }
}
</style>
