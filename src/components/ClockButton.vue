<script setup lang="ts">
import type { SessionPhase } from '@/core/session'

defineProps<{
  phase: SessionPhase
  actionLabel: string
  hint: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  (event: 'toggle'): void
}>()
</script>

<template>
  <button
    class="clock"
    type="button"
    :data-phase="phase"
    :disabled="disabled"
    @click="emit('toggle')"
  >
    <span class="clock__beacon" aria-hidden="true" />
    <span class="clock__body">
      <span class="clock__action">{{ actionLabel }}</span>
      <span class="clock__hint">{{ hint }}</span>
    </span>
    <span class="clock__chevron" aria-hidden="true">›</span>
  </button>
</template>

<style scoped>
.clock {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--brass-400);
  border-radius: var(--radius-sm);
  background:
    linear-gradient(180deg, rgba(227, 178, 99, 0.22), rgba(227, 178, 99, 0.06)),
    var(--ink-900);
  color: var(--brass-100);
  text-align: left;
  transition:
    background var(--dur-fast) var(--ease-out),
    border-color var(--dur-fast) var(--ease-out),
    transform var(--dur-fast) var(--ease-out);
}

.clock:hover:not(:disabled) {
  background:
    linear-gradient(180deg, rgba(227, 178, 99, 0.32), rgba(227, 178, 99, 0.1)),
    var(--ink-900);
  border-color: var(--brass-300);
}

.clock:active:not(:disabled) {
  transform: translateY(1px);
}

.clock:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.clock[data-phase='waiting'],
.clock[data-phase='auto'],
.clock[data-phase='working'],
.clock[data-phase='break'] {
  border-color: rgba(78, 198, 182, 0.5);
  background:
    linear-gradient(180deg, rgba(78, 198, 182, 0.16), rgba(78, 198, 182, 0.04)),
    var(--ink-900);
  color: var(--teal-100);
}

.clock[data-phase='stopped'],
.clock[data-phase='autoClosed'] {
  border-color: var(--line-strong);
  background: rgba(255, 255, 255, 0.028);
  color: var(--ivory-300);
}

.clock__beacon {
  position: relative;
  flex: 0 0 auto;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--brass-400);
  box-shadow: 0 0 0 4px rgba(227, 178, 99, 0.14);
}

.clock[data-phase='waiting'] .clock__beacon,
.clock[data-phase='auto'] .clock__beacon,
.clock[data-phase='working'] .clock__beacon,
.clock[data-phase='break'] .clock__beacon {
  background: var(--teal-400);
  box-shadow: 0 0 0 4px rgba(78, 198, 182, 0.16);
}

.clock[data-phase='auto'] .clock__beacon,
.clock[data-phase='working'] .clock__beacon {
  animation: beacon-pulse 1.8s var(--ease-out) infinite;
}

.clock[data-phase='stopped'] .clock__beacon,
.clock[data-phase='autoClosed'] .clock__beacon {
  background: var(--ivory-700);
  box-shadow: none;
}

.clock__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.clock__action {
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.06em;
}

.clock__hint {
  font-size: 11px;
  color: var(--ivory-600);
}

.clock[data-phase='waiting'] .clock__hint,
.clock[data-phase='auto'] .clock__hint,
.clock[data-phase='working'] .clock__hint,
.clock[data-phase='break'] .clock__hint {
  color: var(--teal-200);
}

.clock__chevron {
  flex: 0 0 auto;
  font-size: 20px;
  line-height: 1;
  color: var(--ivory-700);
}

@keyframes beacon-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 4px rgba(78, 198, 182, 0.16);
  }
  50% {
    box-shadow: 0 0 0 8px rgba(78, 198, 182, 0.04);
  }
}
</style>
