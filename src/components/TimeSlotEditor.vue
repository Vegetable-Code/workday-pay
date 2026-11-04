<script setup lang="ts">
import { computed } from 'vue'
import type { TimeSlot } from '@/core/types'
import { isValidSlot, totalSlotMinutes } from '@/core/timeslots'

const props = defineProps<{
  modelValue: TimeSlot[]
}>()

const emit = defineEmits<{
  (event: 'update:modelValue', value: TimeSlot[]): void
}>()

let counter = 0

function nextId(): string {
  counter += 1
  return `slot-${Date.now()}-${counter}`
}

function patch(id: string, field: 'start' | 'end', value: string): void {
  emit(
    'update:modelValue',
    props.modelValue.map((slot) => (slot.id === id ? { ...slot, [field]: value } : slot)),
  )
}

function remove(id: string): void {
  emit(
    'update:modelValue',
    props.modelValue.filter((slot) => slot.id !== id),
  )
}

function add(): void {
  const last = props.modelValue[props.modelValue.length - 1]
  const start = last ? last.end : '09:00'
  emit('update:modelValue', [
    ...props.modelValue,
    { id: nextId(), start, end: addHour(start) },
  ])
}

function addHour(value: string): string {
  const [hour = 0, minute = 0] = value.split(':').map(Number)
  const total = Math.min(23 * 60 + 59, hour * 60 + minute + 60)
  const nextHour = Math.floor(total / 60)
  const nextMinute = total % 60
  return `${String(nextHour).padStart(2, '0')}:${String(nextMinute).padStart(2, '0')}`
}

const totalMinutes = computed(() => totalSlotMinutes(props.modelValue))
</script>

<template>
  <div class="slots">
    <ul class="slots__list">
      <li v-for="slot in modelValue" :key="slot.id" class="slots__row">
        <input
          class="slots__input tabular"
          type="time"
          :value="slot.start"
          :aria-label="`时段开始时间 ${slot.start}`"
          @input="patch(slot.id, 'start', ($event.target as HTMLInputElement).value)"
        />
        <span class="slots__sep">—</span>
        <input
          class="slots__input tabular"
          type="time"
          :value="slot.end"
          :aria-label="`时段结束时间 ${slot.end}`"
          @input="patch(slot.id, 'end', ($event.target as HTMLInputElement).value)"
        />
        <span class="slots__duration tabular">
          {{ Math.max(0, totalSlotMinutes([slot]) / 60).toFixed(1) }}h
        </span>
        <button
          class="slots__remove"
          type="button"
          :aria-label="`删除时段 ${slot.start} 至 ${slot.end}`"
          @click="remove(slot.id)"
        >
          ×
        </button>
        <p v-if="!isValidSlot(slot)" class="slots__warn">结束时间需晚于开始时间</p>
      </li>
    </ul>

    <div class="slots__footer">
      <button class="slots__add" type="button" @click="add">+ 添加时段</button>
      <span class="slots__total tabular">每日共 {{ (totalMinutes / 60).toFixed(2) }} 小时</span>
    </div>
  </div>
</template>

<style scoped>
.slots {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.slots__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.slots__row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.slots__input {
  width: 106px;
  padding: 6px 8px;
  border: 1px solid var(--line-soft);
  border-radius: var(--radius-xs);
  background: var(--ink-900);
  color: var(--ivory-100);
  font-size: 12px;
  transition: border-color var(--dur-fast) var(--ease-out);
}

.slots__input:focus {
  border-color: var(--brass-400);
}

.slots__input::-webkit-calendar-picker-indicator {
  filter: invert(0.7) sepia(0.4) saturate(3) hue-rotate(5deg);
  cursor: pointer;
}

.slots__sep {
  color: var(--ivory-700);
}

.slots__duration {
  min-width: 42px;
  font-size: 11px;
  color: var(--ivory-600);
}

.slots__remove {
  width: 22px;
  height: 22px;
  border: 1px solid var(--line-soft);
  border-radius: var(--radius-xs);
  background: transparent;
  color: var(--ivory-600);
  font-size: 14px;
  line-height: 1;
  transition:
    color var(--dur-fast) var(--ease-out),
    border-color var(--dur-fast) var(--ease-out);
}

.slots__remove:hover {
  color: var(--brick-300);
  border-color: rgba(217, 106, 78, 0.6);
}

.slots__warn {
  flex-basis: 100%;
  font-size: 10px;
  color: var(--brick-300);
}

.slots__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.slots__add {
  padding: 5px 10px;
  border: 1px dashed var(--line-strong);
  border-radius: var(--radius-xs);
  background: rgba(227, 178, 99, 0.06);
  color: var(--brass-300);
  font-size: 11px;
  transition: background var(--dur-fast) var(--ease-out);
}

.slots__add:hover {
  background: rgba(227, 178, 99, 0.14);
}

.slots__total {
  font-size: 11px;
  color: var(--ivory-600);
}
</style>
