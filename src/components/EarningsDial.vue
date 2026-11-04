<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { formatMoney, formatPercent } from '@/core/format'

const props = defineProps<{
  earned: number
  ratio: number
  hourlyRate: number
  status: string
  statusTone: 'active' | 'idle' | 'done'
}>()

const RADIUS = 118
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

const dashOffset = computed(() => CIRCUMFERENCE * (1 - Math.min(1, Math.max(0, props.ratio))))

const integerPart = computed(() => {
  const [integer] = formatMoney(props.earned).split('.')
  return integer ?? '0'
})

const decimalPart = computed(() => {
  const [, decimal] = formatMoney(props.earned).split('.')
  return decimal ?? '00'
})

/** 刻度环:每 6 格一根长刻度 */
const ticks = Array.from({ length: 60 }, (_, index) => ({
  angle: index * 6,
  major: index % 6 === 0,
  active: index / 60 <= Math.min(1, Math.max(0, props.ratio)),
}))

const pulse = ref(false)
watch(
  () => props.earned,
  () => {
    pulse.value = false
    requestAnimationFrame(() => {
      pulse.value = true
    })
  },
)
</script>

<template>
  <div class="dial" :data-tone="statusTone">
    <div class="dial__face">
      <svg class="dial__svg" viewBox="0 0 300 300" aria-hidden="true">
        <defs>
          <radialGradient id="dialWell" cx="50%" cy="42%" r="62%">
            <stop offset="0%" stop-color="#241e18" />
            <stop offset="72%" stop-color="#100e0c" />
          </radialGradient>
          <linearGradient id="dialArc" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="var(--brass-300)" />
            <stop offset="55%" stop-color="var(--brass-400)" />
            <stop offset="100%" stop-color="var(--brass-600)" />
          </linearGradient>
          <filter id="dialGlow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <circle class="dial__well" cx="150" cy="150" :r="RADIUS + 26" fill="url(#dialWell)" />
        <circle class="dial__track" cx="150" cy="150" :r="RADIUS" />

        <g class="dial__ticks">
          <line
            v-for="tick in ticks"
            :key="tick.angle"
            :x1="150 + (RADIUS + 16) * Math.cos((tick.angle * Math.PI) / 180)"
            :y1="150 + (RADIUS + 16) * Math.sin((tick.angle * Math.PI) / 180)"
            :x2="150 + (RADIUS + (tick.major ? 4 : 8)) * Math.cos((tick.angle * Math.PI) / 180)"
            :y2="150 + (RADIUS + (tick.major ? 4 : 8)) * Math.sin((tick.angle * Math.PI) / 180)"
            :class="{ 'is-major': tick.major, 'is-active': tick.active }"
          />
        </g>

        <circle
          class="dial__arc"
          cx="150"
          cy="150"
          :r="RADIUS"
          filter="url(#dialGlow)"
          :stroke-dasharray="CIRCUMFERENCE"
          :stroke-dashoffset="dashOffset"
        />
      </svg>

      <div class="dial__readout">
        <p class="label dial__caption">本月已赚</p>
        <p class="dial__amount tabular" :class="{ 'is-pulse': pulse }">
          <span class="dial__symbol">¥</span>
          <span class="dial__integer">{{ integerPart }}</span>
          <span class="dial__decimal">.{{ decimalPart }}</span>
        </p>
        <p class="dial__ratio tabular">{{ formatPercent(ratio) }} · ¥{{ hourlyRate.toFixed(2) }}/小时</p>
        <p class="dial__status" :data-tone="statusTone">{{ status }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dial {
  display: flex;
  justify-content: center;
  padding: var(--space-2) 0 var(--space-4);
}

.dial__face {
  position: relative;
  width: min(320px, 78vw);
  aspect-ratio: 1;
}

.dial__svg {
  width: 100%;
  height: 100%;
  overflow: visible;
  transform: rotate(-90deg);
}

.dial__well {
  stroke: var(--line-faint);
  stroke-width: 1;
}

.dial__track {
  fill: none;
  stroke: rgba(227, 178, 99, 0.12);
  stroke-width: 6;
}

.dial__ticks line {
  stroke: rgba(179, 168, 148, 0.28);
  stroke-width: 1;
}

.dial__ticks line.is-major {
  stroke: rgba(227, 178, 99, 0.55);
  stroke-width: 1.6;
}

.dial__ticks line.is-active {
  stroke: var(--brass-300);
}

.dial__arc {
  fill: none;
  stroke: url(#dialArc);
  stroke-width: 6;
  stroke-linecap: round;
  transition: stroke-dashoffset var(--dur-base) var(--ease-out);
}

.dial__readout {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  text-align: center;
}

.dial__caption {
  color: var(--ivory-600);
}

.dial__amount {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 2px;
  color: var(--ivory-100);
  font-size: clamp(2rem, 8.4vw, 2.9rem);
  font-weight: 500;
  line-height: 1;
  letter-spacing: -0.02em;
  text-shadow: 0 0 26px rgba(227, 178, 99, 0.22);
}

.dial__amount.is-pulse .dial__integer,
.dial__amount.is-pulse .dial__decimal {
  animation: dial-flash var(--dur-slow) var(--ease-out);
}

.dial__symbol {
  font-size: 0.46em;
  color: var(--brass-400);
  transform: translateY(-0.18em);
}

.dial__decimal {
  font-size: 0.46em;
  color: var(--brass-400);
}

.dial__ratio {
  font-size: 11px;
  color: var(--ivory-600);
  letter-spacing: 0.04em;
}

.dial__status {
  padding: 3px 10px;
  border: 1px solid var(--line-soft);
  border-radius: 999px;
  background: rgba(227, 178, 99, 0.08);
  font-size: 11px;
  letter-spacing: 0.12em;
  color: var(--brass-200);
}

.dial__status[data-tone='idle'] {
  border-color: rgba(124, 114, 99, 0.45);
  background: rgba(124, 114, 99, 0.12);
  color: var(--ivory-400);
}

.dial__status[data-tone='done'] {
  border-color: rgba(78, 198, 182, 0.4);
  background: rgba(78, 198, 182, 0.12);
  color: var(--teal-300);
}

@keyframes dial-flash {
  0% {
    color: var(--brass-200);
    text-shadow: 0 0 22px rgba(227, 178, 99, 0.75);
  }
  100% {
    color: var(--ivory-100);
    text-shadow: 0 0 26px rgba(227, 178, 99, 0.22);
  }
}

/* 桌面端表盘跟随主栏高度收缩,保证下方时间轴始终有足够空间 */
@media (min-width: 920px) {
  .dial {
    padding: 0;
  }

  .dial__face {
    width: min(320px, 78vw, 46vh);
  }

  @supports (container-type: size) {
    .dial__face {
      width: min(320px, 78vw, 52cqh);
    }
  }
}
</style>
