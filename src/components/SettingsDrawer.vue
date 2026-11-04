<script setup lang="ts">
import { computed, ref } from 'vue'
import type { TimeSlot, Weekday } from '@/core/types'
import {
  applyWeekPreset,
  resetSettings,
  setStartDate,
  setWorkDay,
  settings,
} from '@/stores/settings'
import type { WeekPreset } from '@/stores/settings'
import { storageHealthy } from '@/core/storage'
import { bundledSource, bundledVersion, updateYear } from '@/data/holidays'
import { takeLeadingHours, totalSlotMinutes } from '@/core/timeslots'
import { formatHours } from '@/core/format'
import TimeSlotEditor from './TimeSlotEditor.vue'

const props = defineProps<{
  open: boolean
  year: number
}>()

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'dataUpdated', year: number): void
}>()

const WEEKDAYS: { value: Weekday; label: string }[] = [
  { value: 1, label: '星期一' },
  { value: 2, label: '星期二' },
  { value: 3, label: '星期三' },
  { value: 4, label: '星期四' },
  { value: 5, label: '星期五' },
  { value: 6, label: '星期六' },
  { value: 0, label: '星期日' },
]

const PRESETS: { key: WeekPreset; label: string }[] = [
  { key: 'double', label: '双休' },
  { key: 'single', label: '单休' },
  { key: 'fiveHalf', label: '5.5 天' },
]

const salaryInput = ref(String(settings.monthlySalary))
const startDateInput = ref(settings.startDate)
const updateState = ref<'idle' | 'loading' | 'done' | 'error'>('idle')
const updateMessage = ref('')

function commitSalary(): void {
  const value = Number(salaryInput.value.replace(/[^\d.]/g, ''))
  if (Number.isFinite(value) && value >= 0) {
    settings.monthlySalary = value
  } else {
    salaryInput.value = String(settings.monthlySalary)
  }
}

/** 输入过程中实时落盘,避免还没失焦就刷新导致数值丢失 */
function syncSalary(): void {
  const value = Number(salaryInput.value.replace(/[^\d.]/g, ''))
  if (Number.isFinite(value) && value >= 0) {
    settings.monthlySalary = value
  }
}

function onBaseSlots(value: TimeSlot[]): void {
  settings.slots = value
}

function commitStartDate(): void {
  setStartDate(startDateInput.value)
  startDateInput.value = settings.startDate
}

function overrideSlots(weekday: Weekday): TimeSlot[] {
  return settings.weeklyOverrides[weekday] ?? []
}

function hasOverride(weekday: Weekday): boolean {
  return Boolean(settings.weeklyOverrides[weekday])
}

function toggleOverride(weekday: Weekday, enabled: boolean): void {
  if (!enabled) {
    delete settings.weeklyOverrides[weekday]
    return
  }
  settings.weeklyOverrides[weekday] = settings.slots.map((slot) => ({ ...slot }))
}

function onOverrideSlots(weekday: Weekday, value: TimeSlot[]): void {
  settings.weeklyOverrides[weekday] = value
}

function isWork(weekday: Weekday): boolean {
  return settings.workDays.includes(weekday)
}

/** 该星期几当天的排班工时 */
function weekdayHours(weekday: Weekday): number {
  if (!isWork(weekday)) return 0
  const slots = settings.weeklyOverrides[weekday] ?? settings.slots
  return totalSlotMinutes(slots) / 60
}

/** 每日默认工时,作为「折合多少天」的换算基准 */
const baseHours = computed(() => totalSlotMinutes(settings.slots) / 60)

function sameDays(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((day) => b.includes(day))
}

function sameSlots(a: TimeSlot[], b: TimeSlot[]): boolean {
  if (a.length !== b.length) return false
  return a.every((slot, index) => {
    const other = b[index]
    return Boolean(other) && slot.start === other?.start && slot.end === other?.end
  })
}

/** 当前排班与哪个预设一致,都不一致时视为自定义 */
const activePreset = computed<WeekPreset | 'custom'>(() => {
  const days = settings.workDays
  const saturday = settings.weeklyOverrides[6]
  if (sameDays(days, [1, 2, 3, 4, 5]) && !saturday && !settings.weeklyOverrides[0]) {
    return 'double'
  }
  if (sameDays(days, [1, 2, 3, 4, 5, 6])) {
    if (!saturday) return 'single'
    if (sameSlots(saturday, takeLeadingHours(settings.slots, 3))) return 'fiveHalf'
  }
  return 'custom'
})

function applyPreset(preset: WeekPreset): void {
  applyWeekPreset(preset)
}

function onReset(): void {
  resetSettings()
  salaryInput.value = String(settings.monthlySalary)
  startDateInput.value = settings.startDate
}

async function onUpdateYear(): Promise<void> {
  updateState.value = 'loading'
  updateMessage.value = '正在获取…'
  try {
    await updateYear(props.year)
    updateState.value = 'done'
    updateMessage.value = `${props.year} 年放假安排已更新`
    emit('dataUpdated', props.year)
  } catch (error) {
    updateState.value = 'error'
    updateMessage.value = error instanceof Error ? error.message : '更新失败'
  }
}
</script>

<template>
  <div class="drawer-root" :class="{ 'is-open': open }">
    <div class="drawer__scrim" @click="emit('close')" />

    <aside class="drawer panel" role="dialog" aria-label="设置" :aria-hidden="!open">
      <header class="drawer__head">
        <div>
          <p class="label">设置</p>
          <h2 class="drawer__title">薪资与工时</h2>
        </div>
        <button class="drawer__close" type="button" aria-label="关闭设置" @click="emit('close')">×</button>
      </header>

      <div class="drawer__body">
        <section class="drawer__section">
          <h3 class="drawer__section-title">月薪</h3>
          <div class="drawer__field">
            <span class="drawer__currency">¥</span>
            <input
              v-model="salaryInput"
              class="drawer__salary tabular"
              type="text"
              inputmode="decimal"
              aria-label="月薪金额"
              @input="syncSalary"
              @blur="commitSalary"
              @keyup.enter="commitSalary"
            />
            <span class="drawer__unit">元 / 月</span>
          </div>
          <p class="drawer__hint">小时工资 = 月薪 ÷ 当月排班工时,不含加班、请假与税费。</p>
        </section>

        <section class="drawer__section">
          <h3 class="drawer__section-title">入职时间</h3>
          <div class="drawer__field">
            <input
              v-model="startDateInput"
              class="drawer__date tabular"
              type="date"
              aria-label="入职日期"
              @blur="commitStartDate"
              @change="commitStartDate"
            />
            <button class="drawer__clear" type="button" @click="startDateInput = ''; commitStartDate()">
              清除
            </button>
          </div>
          <p class="drawer__hint">
            填写后,入职之前的日期不计薪。当月排班工时按整月计算,入职日之前的工时占分母但不产生收入。
          </p>
        </section>

        <section class="drawer__section">
          <h3 class="drawer__section-title">本地存储</h3>
          <p class="drawer__hint">
      月薪、工时、入职日期、打卡记录与正在查看的月份都存在这台设备的浏览器里,刷新或关闭页面都不会丢失。
          </p>
          <p class="drawer__status" :data-state="storageHealthy ? 'done' : 'error'">
            {{ storageHealthy ? '存储正常,改动已自动保存' : '存储不可用,改动无法保存' }}
          </p>
        </section>

        <section class="drawer__section">
          <h3 class="drawer__section-title">每日工作时间段</h3>
          <TimeSlotEditor :model-value="settings.slots" @update:model-value="onBaseSlots" />
        </section>

        <section class="drawer__section">
          <h3 class="drawer__section-title">每周上班安排</h3>
          <div class="drawer__presets">
            <button
              v-for="preset in PRESETS"
              :key="preset.key"
              type="button"
              class="drawer__preset"
              :class="{ 'is-active': activePreset === preset.key }"
              @click="applyPreset(preset.key)"
            >
              {{ preset.label }}
            </button>
            <span v-if="activePreset === 'custom'" class="drawer__preset-note">自定义</span>
          </div>
          <ul class="drawer__weekdays">
            <li
              v-for="day in WEEKDAYS"
              :key="day.value"
              class="drawer__weekday"
              :data-off="!isWork(day.value)"
            >
              <div class="drawer__weekday-head">
                <span class="drawer__weekday-name">{{ day.label }}</span>
                <div class="drawer__segment">
                  <button
                    type="button"
                    :class="{ 'is-active': isWork(day.value) }"
                    @click="setWorkDay(day.value, true)"
                  >
                    上班
                  </button>
                  <button
                    type="button"
                    :class="{ 'is-active': !isWork(day.value) }"
                    @click="setWorkDay(day.value, false)"
                  >
                    休息
                  </button>
                </div>
              </div>
              <template v-if="isWork(day.value)">
                <p class="drawer__weekday-hours tabular">
                  {{ formatHours(weekdayHours(day.value)) }} 小时
                  <span class="drawer__weekday-days">
                    ≈ {{ baseHours > 0 ? (weekdayHours(day.value) / baseHours).toFixed(2) : '0.00' }} 天
                  </span>
                  <button
                    type="button"
                    class="drawer__link"
                    @click="toggleOverride(day.value, !hasOverride(day.value))"
                  >
                    {{ hasOverride(day.value) ? '恢复默认' : '单独调整' }}
                  </button>
                </p>
                <TimeSlotEditor
                  v-if="hasOverride(day.value)"
                  :model-value="overrideSlots(day.value)"
                  @update:model-value="(value) => onOverrideSlots(day.value, value)"
                />
              </template>
              <p v-else class="drawer__weekday-rest">按排班休息,不产生工资</p>
            </li>
          </ul>
          <p class="drawer__hint">
            法定假日与调休放假按国家安排休息,调休补班日按整天上班计算(忽略当天的单独时段)。半天不用手填 0.5,填实际小时数即可,工资按小时折算。
          </p>
        </section>

        <section class="drawer__section">
          <h3 class="drawer__section-title">放假数据</h3>
          <p class="drawer__hint">
            内置数据来源 {{ bundledSource }} {{ bundledVersion }},覆盖 2004–2026 年。
          </p>
          <div class="drawer__row">
            <button class="drawer__button" type="button" :disabled="updateState === 'loading'" @click="onUpdateYear">
              {{ updateState === 'loading' ? '更新中…' : `在线更新 ${year} 年` }}
            </button>
            <button class="drawer__button drawer__button--ghost" type="button" @click="onReset">
              恢复默认
            </button>
          </div>
          <p v-if="updateMessage" class="drawer__status" :data-state="updateState">{{ updateMessage }}</p>
        </section>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.drawer-root {
  position: fixed;
  inset: 0;
  z-index: 40;
  pointer-events: none;
}

.drawer-root.is-open {
  pointer-events: auto;
}

.drawer__scrim {
  position: absolute;
  inset: 0;
  background: rgba(6, 5, 4, 0.68);
  opacity: 0;
  transition: opacity var(--dur-base) var(--ease-out);
}

.drawer-root.is-open .drawer__scrim {
  opacity: 1;
}

.drawer {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(420px, 100vw);
  display: flex;
  flex-direction: column;
  border-radius: 0;
  border-right: none;
  border-top: none;
  border-bottom: none;
  transform: translateX(100%);
  transition: transform var(--dur-slow) var(--ease-out);
}

.drawer-root.is-open .drawer {
  transform: translateX(0);
}

.drawer__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-5) var(--space-5) var(--space-4);
  border-bottom: 1px solid var(--line-faint);
}

.drawer__title {
  margin-top: 4px;
  font-size: 18px;
  font-weight: 600;
  color: var(--ivory-100);
}

.drawer__close {
  width: 30px;
  height: 30px;
  border: 1px solid var(--line-soft);
  border-radius: var(--radius-xs);
  background: transparent;
  color: var(--ivory-400);
  font-size: 18px;
  line-height: 1;
}

.drawer__close:hover {
  color: var(--ivory-100);
  border-color: var(--line-strong);
}

.drawer__body {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.drawer__section-title {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.08em;
  color: var(--brass-300);
}

.drawer__field {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--line-soft);
  border-radius: var(--radius-sm);
  background: var(--ink-900);
}

.drawer__currency {
  color: var(--brass-400);
  font-size: 18px;
}

.drawer__salary {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  font-size: 22px;
  color: var(--ivory-100);
}

.drawer__salary:focus {
  outline: none;
}

.drawer__date {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  color: var(--ivory-100);
  font-size: 15px;
}

.drawer__date:focus {
  outline: none;
}

.drawer__date::-webkit-calendar-picker-indicator {
  filter: invert(0.7) sepia(0.4) saturate(3) hue-rotate(5deg);
  cursor: pointer;
}

.drawer__clear {
  padding: 4px 9px;
  border: 1px solid var(--line-faint);
  border-radius: var(--radius-xs);
  background: transparent;
  color: var(--ivory-600);
  font-size: 11px;
}

.drawer__clear:hover {
  color: var(--brick-300);
  border-color: rgba(217, 106, 78, 0.5);
}

.drawer__unit {
  font-size: 11px;
  color: var(--ivory-600);
  white-space: nowrap;
}

.drawer__hint {
  margin-top: var(--space-2);
  font-size: 11px;
  line-height: 1.7;
  color: var(--ivory-600);
}

.drawer__weekdays {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin-top: var(--space-3);
}

.drawer__weekday {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding-bottom: var(--space-3);
  border-bottom: 1px dashed var(--line-faint);
}

.drawer__weekday[data-off='true'] {
  opacity: 0.62;
}

.drawer__weekday-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.drawer__weekday-name {
  font-size: 12px;
  color: var(--ivory-200);
}

.drawer__segment {
  display: flex;
  border: 1px solid var(--line-faint);
  border-radius: var(--radius-xs);
  overflow: hidden;
}

.drawer__segment button {
  padding: 4px 12px;
  border: none;
  background: transparent;
  color: var(--ivory-600);
  font-size: 11px;
  transition: background var(--dur-fast) var(--ease-out);
}

.drawer__segment button:hover {
  color: var(--ivory-200);
}

.drawer__segment button.is-active {
  background: rgba(227, 178, 99, 0.16);
  color: var(--brass-200);
}

.drawer__weekday-hours {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: 0;
  font-size: 11px;
  color: var(--ivory-400);
}

.drawer__weekday-days {
  color: var(--ivory-700);
}

.drawer__weekday-rest {
  margin: 0;
  font-size: 11px;
  color: var(--ivory-700);
}

.drawer__link {
  margin-left: auto;
  padding: 2px 0;
  border: none;
  background: transparent;
  color: var(--brass-400);
  font-size: 11px;
}

.drawer__link:hover {
  color: var(--brass-200);
  text-decoration: underline;
}

.drawer__presets {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: var(--space-3);
}

.drawer__preset {
  padding: 5px 12px;
  border: 1px solid var(--line-faint);
  border-radius: var(--radius-xs);
  background: transparent;
  color: var(--ivory-600);
  font-size: 11px;
  transition:
    background var(--dur-fast) var(--ease-out),
    color var(--dur-fast) var(--ease-out);
}

.drawer__preset:hover {
  color: var(--ivory-200);
  border-color: var(--line-soft);
}

.drawer__preset.is-active {
  border-color: var(--brass-500);
  background: rgba(227, 178, 99, 0.14);
  color: var(--brass-200);
}

.drawer__preset-note {
  font-size: 11px;
  color: var(--ivory-700);
}

.drawer__row {
  display: flex;
  gap: var(--space-2);
  margin-top: var(--space-3);
}

.drawer__button {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-xs);
  background: rgba(227, 178, 99, 0.1);
  color: var(--brass-200);
  font-size: 12px;
  transition: background var(--dur-fast) var(--ease-out);
}

.drawer__button:hover:not(:disabled) {
  background: rgba(227, 178, 99, 0.2);
}

.drawer__button:disabled {
  opacity: 0.55;
  cursor: progress;
}

.drawer__button--ghost {
  flex: 0 0 auto;
  border-color: var(--line-faint);
  background: transparent;
  color: var(--ivory-600);
}

.drawer__status {
  margin-top: var(--space-2);
  font-size: 11px;
  color: var(--ivory-600);
}

.drawer__status[data-state='done'] {
  color: var(--teal-300);
}

.drawer__status[data-state='error'] {
  color: var(--brick-300);
}
</style>
