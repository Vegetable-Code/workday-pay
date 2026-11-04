<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { LeaveKind, LeaveRecord, TimeSlot } from '@/core/types'
import { addLeave, removeLeave, settings, updateLeave } from '@/stores/settings'
import {
  LEAVE_KIND_LABELS,
  leaveComputation,
  leaveKindLabel,
  leaveRecordBreakdown,
  leaveSortKey,
} from '@/core/leave'
import { formatHours, formatMoney } from '@/core/format'
import { isValidTime } from '@/core/timeslots'

const props = defineProps<{
  // 当前选中的日期
  date: string
  // 当天的排班时段,用来判断请假与排班的重叠
  slots: TimeSlot[]
  // 小时工资,用来把扣减工时换算成钱
  hourlyRate: number
  // 当天是否上班
  isWorkday: boolean
}>()

const KIND_OPTIONS = Object.entries(LEAVE_KIND_LABELS) as Array<[LeaveKind, string]>
const QUICK_PERCENTS = [0, 50, 100]

const formOpen = ref(false)
const start = ref('09:00')
const end = ref('12:00')
const kind = ref<LeaveKind>('personal')
const deductPercent = ref(100)

const records = computed<LeaveRecord[]>(() =>
  [...(settings.leaves[props.date] ?? [])].sort((a, b) => leaveSortKey(a) - leaveSortKey(b)),
)

// 当天所有请假合计出来的工时与扣钱
const summary = computed(() => leaveComputation(records.value, props.slots))

// 每条请假在重叠规则下实际归属到的时长与扣款
const breakdown = computed(() => leaveRecordBreakdown(records.value, props.slots))

// 每条请假单独算一次,用来在列表里显示各自扣了多少
const rows = computed(() =>
  records.value.map((record, index) => {
    const detail = breakdown.value[index]
    return {
      record,
      overlapHours: (detail?.overlapMinutes ?? 0) / 60,
      deductedHours: (detail?.deductedMinutes ?? 0) / 60,
      paidHours: (detail?.paidMinutes ?? 0) / 60,
      money: ((detail?.deductedMinutes ?? 0) / 60) * props.hourlyRate,
    }
  }),
)

const valid = computed(
  () => isValidTime(start.value) && isValidTime(end.value) && start.value < end.value,
)

watch(
  () => props.date,
  () => {
    formOpen.value = false
    resetForm()
  },
)

function resetForm(): void {
  const first = props.slots[0]
  start.value = first?.start ?? '09:00'
  end.value = first?.end ?? '12:00'
  kind.value = 'personal'
  deductPercent.value = 100
}

function toggleForm(): void {
  formOpen.value = !formOpen.value
  if (formOpen.value) resetForm()
}

function submit(): void {
  if (!valid.value) return
  const created = addLeave(props.date, {
    start: start.value,
    end: end.value,
    kind: kind.value,
    deductPercent: deductPercent.value,
  })
  if (created) {
    formOpen.value = false
    resetForm()
  }
}

function changePercent(record: LeaveRecord, value: number): void {
  updateLeave(props.date, record.id, { deductPercent: value })
}
</script>

<template>
  <div class="leave">
    <div class="leave__head">
      <p class="label">请假</p>
      <div class="leave__head-right">
        <span v-if="records.length" class="leave__summary tabular">
          {{ records.length }} 条 · 合计 {{ formatHours(summary.total / 60) }}h ·
          扣 ¥{{ formatMoney(summary.deducted / 60 * hourlyRate) }}
        </span>
        <button class="leave__toggle" type="button" @click="toggleForm">
          {{ formOpen ? '收起' : '添加请假' }}
        </button>
      </div>
    </div>

    <p v-if="!isWorkday" class="leave__hint leave__hint--warn">
      当天不上班,请假不会影响工时与工资
    </p>

    <ul v-if="rows.length" class="leave__list">
      <li v-for="row in rows" :key="row.record.id" class="leave__row">
        <span class="leave__time tabular">{{ row.record.start }}–{{ row.record.end }}</span>
        <span class="leave__kind">{{ leaveKindLabel(row.record.kind) }}</span>
        <span class="leave__percent">
          扣
          <input
            class="leave__percent-input tabular"
            type="number"
            min="0"
            max="100"
            step="5"
            :value="row.record.deductPercent"
            :aria-label="`${row.record.start} 到 ${row.record.end} 的扣薪百分比`"
            @change="changePercent(row.record, Number(($event.target as HTMLInputElement).value))"
          />
          %
        </span>
        <span class="leave__detail tabular">
          {{ formatHours(row.overlapHours) }}h
          <template v-if="row.paidHours > 0"> · 带薪 {{ formatHours(row.paidHours) }}h</template>
          · 扣 ¥{{ formatMoney(row.money) }}
        </span>
        <button
          class="leave__remove"
          type="button"
          :aria-label="`删除 ${row.record.start} 到 ${row.record.end} 的请假`"
          @click="removeLeave(props.date, row.record.id)"
        >
          ×
        </button>
      </li>
    </ul>

    <p v-else-if="!formOpen" class="leave__hint">当天没有请假记录</p>

    <form v-if="formOpen" class="leave__form" @submit.prevent="submit">
      <label class="leave__field">
        <span class="label">开始</span>
        <input v-model="start" class="leave__input tabular" type="time" />
      </label>
      <label class="leave__field">
        <span class="label">结束</span>
        <input v-model="end" class="leave__input tabular" type="time" />
      </label>
      <label class="leave__field">
        <span class="label">类型</span>
        <select v-model="kind" class="leave__input">
          <option v-for="[value, label] in KIND_OPTIONS" :key="value" :value="value">
            {{ label }}
          </option>
        </select>
      </label>
      <div class="leave__field">
        <span class="label">扣薪</span>
        <div class="leave__quick">
          <button
            v-for="value in QUICK_PERCENTS"
            :key="value"
            class="leave__quick-btn"
            :class="{ 'is-active': deductPercent === value }"
            type="button"
            @click="deductPercent = value"
          >
            {{ value === 0 ? '带薪' : `${value}%` }}
          </button>
        </div>
      </div>
      <div class="leave__actions">
        <button class="leave__submit" type="submit" :disabled="!valid">保存</button>
        <button class="leave__cancel" type="button" @click="formOpen = false">取消</button>
      </div>
      <p v-if="!valid" class="leave__warn">结束时间需要晚于开始时间</p>
      <p v-if="records.length" class="leave__hint">
        当天请假共 {{ formatHours(summary.total / 60) }} 小时,扣 ¥{{ formatMoney((summary.deducted / 60) * hourlyRate) }}
      </p>
    </form>
  </div>
</template>

<style scoped>
.leave {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-height: 0;
  padding-top: var(--space-3);
  border-top: 1px solid var(--line-faint);
}

.leave__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-3);
}

.leave__head-right {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.leave__summary {
  font-size: 11px;
  color: var(--ivory-600);
}

.leave__toggle {
  padding: 4px 9px;
  border: 1px solid var(--line-soft);
  border-radius: var(--radius-xs);
  background: transparent;
  color: var(--ivory-400);
  font-size: 11px;
  transition:
    color var(--dur-fast) var(--ease-out),
    border-color var(--dur-fast) var(--ease-out);
}

.leave__toggle:hover {
  color: var(--brass-300);
  border-color: var(--line-strong);
}

.leave__hint {
  margin: 0;
  font-size: 11px;
  color: var(--ivory-700);
}

.leave__hint--warn {
  color: var(--brick-300);
}

.leave__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-height: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}

.leave__row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
  padding: 4px 8px;
  border: 1px solid var(--line-faint);
  border-radius: var(--radius-xs);
  background: rgba(217, 106, 78, 0.07);
}

.leave__time {
  font-size: 12px;
  color: var(--ivory-100);
}

.leave__kind {
  font-size: 11px;
  color: var(--brick-300);
}

.leave__percent {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  color: var(--ivory-600);
}

.leave__percent-input {
  width: 48px;
  padding: 2px 4px;
  border: 1px solid var(--line-soft);
  border-radius: var(--radius-xs);
  background: var(--ink-900);
  color: var(--ivory-100);
  font-size: 11px;
}

.leave__detail {
  margin-left: auto;
  font-size: 11px;
  color: var(--ivory-600);
}

.leave__remove {
  width: 20px;
  height: 20px;
  border: 1px solid transparent;
  border-radius: var(--radius-xs);
  background: transparent;
  color: var(--ivory-600);
  font-size: 13px;
  line-height: 1;
}

.leave__remove:hover {
  color: var(--brick-300);
  border-color: rgba(217, 106, 78, 0.5);
}

.leave__form {
  display: flex;
  align-items: flex-end;
  flex-wrap: wrap;
  gap: var(--space-2);
  padding: var(--space-2);
  border: 1px dashed var(--line-soft);
  border-radius: var(--radius-xs);
}

.leave__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.leave__input {
  padding: 5px 7px;
  border: 1px solid var(--line-soft);
  border-radius: var(--radius-xs);
  background: var(--ink-900);
  color: var(--ivory-100);
  font-size: 12px;
}

.leave__input:focus {
  border-color: var(--brass-400);
}

.leave__input::-webkit-calendar-picker-indicator {
  filter: invert(0.7) sepia(0.4) saturate(3) hue-rotate(5deg);
  cursor: pointer;
}

.leave__quick {
  display: flex;
  gap: 4px;
}

.leave__quick-btn {
  padding: 4px 8px;
  border: 1px solid var(--line-faint);
  border-radius: var(--radius-xs);
  background: transparent;
  color: var(--ivory-600);
  font-size: 11px;
}

.leave__quick-btn.is-active {
  border-color: var(--brass-500);
  background: rgba(227, 178, 99, 0.16);
  color: var(--brass-200);
}

.leave__actions {
  display: flex;
  gap: var(--space-2);
}

.leave__submit {
  padding: 5px 12px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-xs);
  background: rgba(227, 178, 99, 0.12);
  color: var(--brass-200);
  font-size: 12px;
}

.leave__submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.leave__cancel {
  padding: 5px 12px;
  border: 1px solid var(--line-faint);
  border-radius: var(--radius-xs);
  background: transparent;
  color: var(--ivory-600);
  font-size: 12px;
}

.leave__warn {
  flex-basis: 100%;
  margin: 0;
  font-size: 10px;
  color: var(--brick-300);
}

/* 桌面端请假区是面板右栏,改成竖向分隔 */
@media (min-width: 920px) {
  .leave {
    padding-top: 0;
    padding-left: var(--space-3);
    border-top: none;
    border-left: 1px solid var(--line-faint);
  }

  .leave__list {
    /* 请假条数很多时列表自己滚动,面板整体高度不变 */
    max-height: 132px;
    overflow-y: auto;
  }

  .leave__form {
    gap: var(--space-1) var(--space-2);
    padding: var(--space-2);
  }

  .leave__input {
    padding: 4px 6px;
    font-size: 11px;
  }

  .leave__row {
    padding: 3px 7px;
  }
}
</style>
