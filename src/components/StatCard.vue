<script setup lang="ts">
defineProps<{
  label: string
  value: string
  unit?: string
  hint?: string
  tone?: 'default' | 'brass' | 'teal' | 'brick'
}>()
</script>

<template>
  <div class="stat" :data-tone="tone ?? 'default'">
    <p class="label stat__label">{{ label }}</p>
    <p class="stat__value tabular">
      {{ value }}<span v-if="unit" class="stat__unit">{{ unit }}</span>
    </p>
    <p v-if="hint" class="stat__hint">{{ hint }}</p>
  </div>
</template>

<style scoped>
.stat {
  position: relative;
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--line-faint);
  border-radius: var(--radius-sm);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.032), rgba(0, 0, 0, 0.16));
  overflow: hidden;
}

.stat::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  width: 28px;
  height: 1px;
  background: var(--brass-500);
}

.stat[data-tone='teal']::before {
  background: var(--teal-400);
}

.stat[data-tone='brick']::before {
  background: var(--brick-400);
}

.stat[data-tone='default']::before {
  background: var(--ivory-700);
}

.stat__label {
  margin-bottom: 6px;
}

.stat__value {
  font-size: 21px;
  font-weight: 500;
  color: var(--ivory-100);
  line-height: 1.15;
  letter-spacing: -0.01em;
}

.stat[data-tone='brass'] .stat__value {
  color: var(--brass-300);
}

.stat[data-tone='teal'] .stat__value {
  color: var(--teal-300);
}

.stat[data-tone='brick'] .stat__value {
  color: var(--brick-300);
}

.stat__unit {
  margin-left: 3px;
  font-size: 11px;
  color: var(--ivory-600);
}

.stat__hint {
  margin-top: 5px;
  font-size: 10px;
  line-height: 1.5;
  color: var(--ivory-700);
}

/* 桌面端卡片更紧凑,给日历腾出高度 */
@media (min-width: 920px) {
  .stat {
    padding: var(--space-2) var(--space-3);
  }

  .stat__label {
    margin-bottom: 4px;
  }

  .stat__value {
    font-size: 19px;
  }

  .stat__hint {
    margin-top: 4px;
    line-height: 1.45;
  }
}
</style>
