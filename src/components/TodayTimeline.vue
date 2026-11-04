<script setup lang="ts">
import { computed } from 'vue'
import type { TimeSlot } from '@/core/types'
import { toMinutes } from '@/core/timeslots'
import { formatClock } from '@/core/timeslots'

const props = defineProps<{
  slots: TimeSlot[]
  nowMinutes: number
  workedMinutes: number
  scheduledMinutes: number
  isWorkday: boolean
  /** 计时起点(分钟),未打卡为 null */
  sessionFrom: number | null
  /** 计时终点(分钟) */
  sessionTo: number | null
  /** 请假区间(分钟),画成斜纹覆盖在时间轴上 */
  leaveRanges?: { start: number; end: number }[]
  /** 非工作日时的提示文案 */
  emptyText?: string
}>()

interface Segment {
  key: string
  kind: 'slot' | 'break'
  start: number
  end: number
  left: number
  width: number
  /** 已计时覆盖的起点(相对时段起点的小时数) */
  fillLeft: number
  fillWidth: number
  elapsed: boolean
  running: boolean
}

const ranges = computed(() =>
  props.slots
    .map((slot) => ({ id: slot.id, start: toMinutes(slot.start), end: toMinutes(slot.end) }))
    .filter((range) => range.end > range.start)
    .sort((a, b) => a.start - b.start),
)

/** 请假区间与 [from, to] 重叠的分钟数 */
function leaveOverlap(from: number, to: number): number {
  let total = 0
  for (const range of props.leaveRanges ?? []) {
    const overlap = Math.min(to, range.end) - Math.max(from, range.start)
    if (overlap > 0) total += overlap
  }
  return total
}

const windowStart = computed(() => ranges.value[0]?.start ?? 0)
const windowEnd = computed(() => {
  const last = ranges.value[ranges.value.length - 1]
  return last?.end ?? 0
})
const windowSize = computed(() => Math.max(1, windowEnd.value - windowStart.value))

/** 计时窗口,未打卡时为空窗口 */
const sessionFrom = computed(() => props.sessionFrom ?? props.nowMinutes)
const sessionTo = computed(() => props.sessionTo ?? props.nowMinutes)

const segments = computed<Segment[]>(() => {
  const out: Segment[] = []
  let cursor = windowStart.value

  for (const range of ranges.value) {
    if (range.start > cursor) {
      out.push({
        key: `break-${cursor}`,
        kind: 'break',
        start: cursor,
        end: range.start,
        left: percent(cursor),
        width: percent(range.start) - percent(cursor),
        fillLeft: 0,
        fillWidth: 0,
        elapsed: props.nowMinutes > cursor,
        running: false,
      })
    }
    const coveredStart = Math.max(range.start, sessionFrom.value)
    const coveredEnd = Math.min(range.end, sessionTo.value)
    // 请假时段不产生出勤收入,填充时扣掉
    const covered = Math.max(
      0,
      coveredEnd - coveredStart - leaveOverlap(coveredStart, coveredEnd),
    )
    const span = Math.max(1, range.end - range.start)
    out.push({
      key: range.id,
      kind: 'slot',
      start: range.start,
      end: range.end,
      left: percent(range.start),
      width: percent(range.end) - percent(range.start),
      fillLeft: ((coveredStart - range.start) / span) * 100,
      fillWidth: (covered / span) * 100,
      elapsed: covered >= span,
      running: covered > 0 && covered < span,
    })
    cursor = range.end
  }

  return out
})

const markerLeft = computed(() =>
  Math.min(100, Math.max(0, percent(Math.min(sessionTo.value, windowEnd.value)))),
)

/** 请假区间裁剪到时间轴窗口内,再换算成百分比 */
const leaveSegments = computed(() =>
  (props.leaveRanges ?? [])
    .map((range) => ({
      start: Math.max(range.start, windowStart.value),
      end: Math.min(range.end, windowEnd.value),
    }))
    .filter((range) => range.end > range.start)
    .map((range) => ({
      left: percent(range.start),
      width: percent(range.end) - percent(range.start),
    })),
)

function percent(minutes: number): number {
  return ((minutes - windowStart.value) / windowSize.value) * 100
}

const slotStates = computed(() =>
  props.slots.map((slot) => {
    const start = toMinutes(slot.start)
    const end = toMinutes(slot.end)
    const covered = Math.max(
      0,
      Math.min(end, sessionTo.value) - Math.max(start, sessionFrom.value),
    )
    const span = Math.max(1, end - start)
    const leaveMinutes = leaveOverlap(start, end)
    const state = !props.isWorkday
      ? 'off'
      : leaveMinutes >= span
        ? 'leave'
        : covered >= span
          ? 'done'
          : covered > 0
            ? 'running'
            : 'pending'
    return { slot, state, minutes: Math.max(0, end - start), leaveMinutes }
  }),
)

const progress = computed(() =>
  props.scheduledMinutes > 0
    ? Math.min(1, props.workedMinutes / props.scheduledMinutes)
    : 0,
)
</script>

<template>
  <div class="timeline">
    <div class="timeline__head">
      <h3 class="label">今日工作时段</h3>
      <p class="timeline__count tabular">
        {{ formatClock(workedMinutes) }} / {{ formatClock(scheduledMinutes) }}
      </p>
    </div>

    <div v-if="!isWorkday" class="timeline__empty">
      {{ emptyText ?? '当日不是工作日,没有工资增长' }}
    </div>

    <template v-else>
      <div class="timeline__track" role="img" aria-label="今日工作时段进度">
        <div
          v-for="segment in segments"
          :key="segment.key"
          class="timeline__segment"
          :class="[segment.kind, { 'is-elapsed': segment.elapsed }]"
          :style="{ left: `${segment.left}%`, width: `${segment.width}%` }"
        >
          <div
            v-if="segment.kind === 'slot' && segment.fillWidth > 0"
            class="timeline__fill"
            :style="{ left: `${segment.fillLeft}%`, width: `${segment.fillWidth}%` }"
          />
        </div>
        <div
          v-for="(segment, index) in leaveSegments"
          :key="`leave-${index}`"
          class="timeline__leave"
          :style="{ left: `${segment.left}%`, width: `${segment.width}%` }"
        />
        <div class="timeline__marker" :style="{ left: `${markerLeft}%` }" />
      </div>

      <div class="timeline__scale">
        <span class="tabular">{{ formatClock(windowStart) }}</span>
        <span class="tabular">{{ formatClock(windowEnd) }}</span>
      </div>

      <ul class="timeline__slots">
        <li v-for="item in slotStates" :key="item.slot.id" class="timeline__slot" :data-state="item.state">
          <span class="timeline__slot-time tabular">{{ item.slot.start }} — {{ item.slot.end }}</span>
          <span class="timeline__slot-tag">
            {{
              item.state === 'leave'
                ? '请假'
                : item.state === 'done'
                  ? '已完成'
                  : item.state === 'running'
                    ? '进行中'
                    : '未开始'
            }}
          </span>
        </li>
      </ul>

      <div class="timeline__bar">
        <div class="timeline__bar-fill" :style="{ width: `${progress * 100}%` }" />
      </div>
    </template>
  </div>
</template>

<style scoped>
.timeline {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-height: 0;
}

.timeline__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-3);
}

.timeline__count {
  font-size: 12px;
  color: var(--brass-300);
  letter-spacing: 0.04em;
}

.timeline__empty {
  padding: var(--space-4);
  border: 1px dashed var(--line-soft);
  border-radius: var(--radius-sm);
  background: rgba(124, 114, 99, 0.06);
  color: var(--ivory-600);
  font-size: 12px;
  text-align: center;
}

.timeline__track {
  position: relative;
  height: 34px;
  border: 1px solid var(--line-faint);
  border-radius: var(--radius-xs);
  background:
    repeating-linear-gradient(
      90deg,
      rgba(255, 255, 255, 0.035) 0 1px,
      transparent 1px 10%
    ),
    var(--ink-900);
  overflow: hidden;
}

.timeline__segment {
  position: absolute;
  top: 0;
  bottom: 0;
}

.timeline__segment.slot {
  background: rgba(227, 178, 99, 0.08);
  border-left: 1px solid rgba(227, 178, 99, 0.35);
  border-right: 1px solid rgba(227, 178, 99, 0.35);
}

.timeline__fill {
  position: absolute;
  top: 0;
  bottom: 0;
  background: linear-gradient(180deg, var(--brass-400), var(--brass-600));
  box-shadow: inset 0 0 12px -6px rgba(255, 236, 190, 0.9);
}

.timeline__segment.break {
  background: repeating-linear-gradient(
    135deg,
    rgba(124, 114, 99, 0.28) 0 3px,
    transparent 3px 8px
  );
}

/* 请假时段盖在计时填充之上,表示这段时间不发工资 */
.timeline__leave {
  position: absolute;
  top: 0;
  bottom: 0;
  background: repeating-linear-gradient(
    135deg,
    rgba(217, 106, 78, 0.62) 0 4px,
    rgba(60, 24, 14, 0.62) 4px 8px
  );
  border-left: 1px solid rgba(217, 106, 78, 0.9);
  border-right: 1px solid rgba(217, 106, 78, 0.9);
}

.timeline__marker {
  position: absolute;
  top: -3px;
  bottom: -3px;
  width: 2px;
  background: var(--teal-300);
  box-shadow: 0 0 10px rgba(127, 224, 210, 0.85);
  transform: translateX(-1px);
}

.timeline__marker::before {
  content: "";
  position: absolute;
  top: 0;
  left: 50%;
  width: 7px;
  height: 7px;
  background: var(--teal-300);
  transform: translate(-50%, -2px) rotate(45deg);
}

.timeline__scale {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: var(--ivory-700);
}

.timeline__slots {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.timeline__slot {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 4px 8px;
  border: 1px solid var(--line-faint);
  border-radius: var(--radius-xs);
  background: rgba(255, 255, 255, 0.02);
  font-size: 11px;
}

.timeline__slot-time {
  color: var(--ivory-200);
}

.timeline__slot-tag {
  color: var(--ivory-600);
}

.timeline__slot[data-state='done'] .timeline__slot-tag {
  color: var(--brass-300);
}

.timeline__slot[data-state='running'] {
  border-color: rgba(78, 198, 182, 0.45);
}

.timeline__slot[data-state='running'] .timeline__slot-tag {
  color: var(--teal-300);
}

/* 请假时段不计入出勤,标成请假而不是已完成 */
.timeline__slot[data-state='leave'] {
  border-color: rgba(217, 106, 78, 0.45);
}

.timeline__slot[data-state='leave'] .timeline__slot-tag {
  color: var(--brick-300);
}

.timeline__bar {
  height: 3px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  overflow: hidden;
}

.timeline__bar-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--brass-500), var(--teal-400));
  transition: width var(--dur-base) var(--ease-out);
}

/* 桌面端时间轴铺满左栏,内容超出时由面板统一处理 */
@media (min-width: 920px) {
  .timeline {
    flex: 1 1 auto;
    gap: var(--space-2);
  }

  .timeline__track {
    height: 30px;
  }

  .timeline__slots {
    gap: var(--space-1) var(--space-2);
  }
}
</style>
