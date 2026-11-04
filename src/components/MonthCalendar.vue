<script setup lang="ts">
import { computed } from 'vue'
import type { DayInfo } from '@/core/types'
import { fromYmd } from '@/core/dates'

const props = defineProps<{
  days: DayInfo[]
  today: string
  /** 当前选中的日期 "YYYY-MM-DD" */
  selected?: string
  /** 当月工作日总数(含入职日之前不计薪的那几天) */
  workdayCount?: number
}>()

const emit = defineEmits<{
  (event: 'select', date: string): void
}>()

const WEEK_HEADERS = ['一', '二', '三', '四', '五', '六', '日']

const leadingBlanks = computed(() => {
  const first = props.days[0]
  if (!first) return 0
  const weekday = fromYmd(first.date).getDay()
  return (weekday + 6) % 7
})

const cells = computed(() => [
  ...Array.from({ length: leadingBlanks.value }, (_, index) => ({
    key: `blank-${index}`,
    blank: true as const,
  })),
  ...props.days.map((day) => ({ key: day.date, blank: false as const, day })),
])

const legend = [
  { kind: 'workday', label: '上班' },
  { kind: 'makeup', label: '补班' },
  { kind: 'statutory', label: '法定' },
  { kind: 'inLieu', label: '调休' },
  { kind: 'weekend', label: '周末' },
  { kind: 'off', label: '排班' },
  { kind: 'notStarted', label: '未入职' },
]

const TAG_TEXT: Record<string, string> = {
  makeup: '班',
  statutory: '假',
  inLieu: '调',
  off: '休',
  notStarted: '未',
}
</script>

<template>
  <div class="calendar">
    <div class="calendar__weekdays">
      <span v-for="header in WEEK_HEADERS" :key="header" class="calendar__weekday">{{ header }}</span>
    </div>

    <div class="calendar__grid">
      <div v-for="cell in cells" :key="cell.key" class="calendar__cell-wrap">
        <div
          v-if="!cell.blank"
          class="calendar__cell"
          :data-kind="cell.day.kind"
          :class="{ 'is-today': cell.day.date === today, 'is-selected': cell.day.date === selected }"
          :title="`${cell.day.date} ${cell.day.name}`"
          role="button"
          tabindex="0"
          @click="emit('select', cell.day.date)"
          @keydown.enter="emit('select', cell.day.date)"
          @keydown.space.prevent="emit('select', cell.day.date)"
        >
          <span class="calendar__day tabular">{{ Number(cell.day.date.slice(8)) }}</span>
          <span v-if="cell.day.kind !== 'workday' && cell.day.kind !== 'weekend'" class="calendar__tag">
            {{ TAG_TEXT[cell.day.kind] ?? '' }}
          </span>
          <span v-else-if="cell.day.kind === 'workday'" class="calendar__dot" />
        </div>
        <div v-else class="calendar__cell calendar__cell--blank" />
      </div>
    </div>

    <ul class="calendar__legend">
      <li v-for="item in legend" :key="item.kind" class="calendar__legend-item" :data-kind="item.kind">
        <span class="calendar__swatch" />
        <span>{{ item.label }}</span>
      </li>
    </ul>

    <p class="sr-only">
      {{
        workdayCount ?? days.filter((day) => day.isWorkday).length
      }}
      个工作日
    </p>
  </div>
</template>

<style scoped>
.calendar {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-height: 0;
}

.calendar__weekdays {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 6px;
}

.calendar__weekday {
  text-align: center;
  font-size: 10px;
  letter-spacing: 0.18em;
  color: var(--ivory-700);
}

.calendar__grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 6px;
}

.calendar__cell-wrap {
  display: flex;
  min-height: 0;
}

.calendar__cell {
  position: relative;
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  aspect-ratio: 1;
  border: 1px solid var(--line-faint);
  border-radius: var(--radius-xs);
  background: rgba(255, 255, 255, 0.022);
  cursor: pointer;
  transition:
    transform var(--dur-fast) var(--ease-out),
    border-color var(--dur-fast) var(--ease-out);
}

.calendar__cell:hover {
  transform: translateY(-1px);
  border-color: var(--line-strong);
}

.calendar__cell:focus-visible {
  outline: 1px solid var(--brass-300);
  outline-offset: 1px;
}

.calendar__cell--blank {
  border-color: transparent;
  background: transparent;
}

.calendar__day {
  font-size: 13px;
  color: var(--ivory-200);
}

.calendar__cell[data-kind='workday'] {
  background: rgba(227, 178, 99, 0.07);
  border-color: rgba(227, 178, 99, 0.22);
}

.calendar__cell[data-kind='workday'] .calendar__day {
  color: var(--brass-200);
}

.calendar__cell[data-kind='makeup'] {
  background: rgba(78, 198, 182, 0.1);
  border-color: rgba(78, 198, 182, 0.42);
}

.calendar__cell[data-kind='makeup'] .calendar__day {
  color: var(--teal-300);
}

.calendar__cell[data-kind='statutory'] {
  background: rgba(217, 106, 78, 0.12);
  border-color: rgba(217, 106, 78, 0.45);
}

.calendar__cell[data-kind='statutory'] .calendar__day {
  color: var(--brick-300);
}

.calendar__cell[data-kind='inLieu'] {
  background: repeating-linear-gradient(
    135deg,
    rgba(217, 106, 78, 0.16) 0 3px,
    transparent 3px 7px
  );
  border-color: rgba(217, 106, 78, 0.3);
  border-style: dashed;
}

.calendar__cell[data-kind='weekend'] {
  background: rgba(255, 255, 255, 0.012);
}

.calendar__cell[data-kind='weekend'] .calendar__day {
  color: var(--ivory-700);
}

.calendar__cell[data-kind='off'] {
  background: rgba(255, 255, 255, 0.012);
  border-style: dashed;
  border-color: var(--line-faint);
}

.calendar__cell[data-kind='off'] .calendar__day {
  color: var(--ivory-600);
}

.calendar__cell[data-kind='off'] .calendar__tag {
  background: var(--ink-800);
  color: var(--ivory-600);
}

.calendar__cell[data-kind='notStarted'] {
  background: transparent;
  border-color: var(--line-faint);
  border-style: dotted;
}

.calendar__cell[data-kind='notStarted'] .calendar__day {
  color: var(--ivory-700);
  opacity: 0.6;
}

.calendar__cell[data-kind='notStarted'] .calendar__tag {
  background: var(--ink-800);
  color: var(--ivory-700);
}

.calendar__cell.is-today {
  box-shadow:
    0 0 0 1px var(--brass-300),
    0 0 16px -4px rgba(227, 178, 99, 0.75);
}

.calendar__cell.is-selected {
  border-color: var(--brass-300);
  background: rgba(227, 178, 99, 0.16);
}

.calendar__cell.is-selected .calendar__day {
  color: var(--ivory-100);
  font-weight: 600;
}

.calendar__cell.is-today .calendar__day {
  color: var(--ivory-100);
  font-weight: 600;
}

.calendar__dot {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: var(--brass-400);
}

.calendar__tag {
  position: absolute;
  top: 2px;
  right: 2px;
  padding: 0 3px;
  border-radius: 2px;
  font-size: 9px;
  line-height: 11px;
  color: var(--ink-950);
  background: var(--brass-400);
}

.calendar__cell[data-kind='makeup'] .calendar__tag {
  background: var(--teal-400);
}

.calendar__cell[data-kind='statutory'] .calendar__tag {
  background: var(--brick-400);
}

.calendar__cell[data-kind='inLieu'] .calendar__tag {
  background: var(--brick-600);
  color: var(--brick-300);
}

.calendar__legend {
  display: flex;
  flex-wrap: wrap;
  flex: none;
  gap: var(--space-2) var(--space-4);
  padding-top: var(--space-2);
  border-top: 1px solid var(--line-faint);
}

.calendar__legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--ivory-600);
}

.calendar__swatch {
  width: 9px;
  height: 9px;
  border-radius: 2px;
  border: 1px solid var(--line-soft);
  background: rgba(255, 255, 255, 0.05);
}

.calendar__legend-item[data-kind='workday'] .calendar__swatch {
  background: rgba(227, 178, 99, 0.4);
  border-color: rgba(227, 178, 99, 0.6);
}

.calendar__legend-item[data-kind='makeup'] .calendar__swatch {
  background: rgba(78, 198, 182, 0.45);
  border-color: rgba(78, 198, 182, 0.75);
}

.calendar__legend-item[data-kind='statutory'] .calendar__swatch {
  background: rgba(217, 106, 78, 0.5);
  border-color: rgba(217, 106, 78, 0.8);
}

.calendar__legend-item[data-kind='inLieu'] .calendar__swatch {
  background: repeating-linear-gradient(
    135deg,
    rgba(217, 106, 78, 0.5) 0 2px,
    transparent 2px 5px
  );
  border-color: rgba(217, 106, 78, 0.55);
}

.calendar__legend-item[data-kind='notStarted'] .calendar__swatch {
  background: transparent;
  border-style: dotted;
  border-color: var(--ivory-700);
}

.calendar__legend-item[data-kind='off'] .calendar__swatch {
  background: transparent;
  border-style: dashed;
  border-color: var(--ivory-700);
}

@media (max-width: 480px) {
  .calendar__grid,
  .calendar__weekdays {
    gap: 4px;
  }

  .calendar__day {
    font-size: 12px;
  }
}

/* 桌面端日历按面板剩余高度铺开,格子不再按正方形硬撑 */
@media (min-width: 920px) {
  .calendar {
    flex: 1 1 auto;
    overflow: auto;
    gap: var(--space-2);
  }

  .calendar__grid {
    flex: 1 1 auto;
    min-height: 0;
    gap: 5px;
    grid-auto-rows: minmax(26px, 1fr);
  }

  .calendar__cell {
    aspect-ratio: auto;
  }

  .calendar__legend {
    gap: var(--space-1) var(--space-3);
    font-size: 10px;
  }

  .calendar__legend-item {
    gap: 5px;
    font-size: 10px;
  }

  .calendar__swatch {
    width: 8px;
    height: 8px;
  }
}
</style>
