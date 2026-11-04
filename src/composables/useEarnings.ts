import { computed, onUnmounted, ref } from 'vue'
import type { Ref } from 'vue'
import type { EarningsResult, HolidayData } from '@/core/types'
import { computeEarnings } from '@/core/salary'
import { allHolidayData } from '@/data/holidays'
import { settings } from '@/stores/settings'
import { setViewMonth, view } from '@/stores/view'

/** 每秒推进一次的当前时刻 */
export function useNow(intervalMs = 1000) {
  const now = ref(new Date())
  const timer = window.setInterval(() => {
    now.value = new Date()
  }, intervalMs)

  onUnmounted(() => {
    window.clearInterval(timer)
  })

  return now
}

export function useEarnings(now: Ref<Date>) {
  const holidayData = ref<HolidayData>(allHolidayData())
  const viewYear = computed(() => view.year)
  const viewMonth = computed(() => view.month)

  const result = computed<EarningsResult>(() =>
    computeEarnings(viewYear.value, viewMonth.value, {
      settings,
      data: holidayData.value,
      now: now.value,
    }),
  )

  const isCurrentMonth = computed(
    () =>
      viewYear.value === now.value.getFullYear() &&
      viewMonth.value === now.value.getMonth() + 1,
  )

  function refreshHolidayData(): void {
    holidayData.value = allHolidayData()
  }

  function shiftMonth(delta: number): void {
    const next = new Date(viewYear.value, viewMonth.value - 1 + delta, 1)
    setViewMonth(next.getFullYear(), next.getMonth() + 1)
  }

  function goToday(): void {
    setViewMonth(now.value.getFullYear(), now.value.getMonth() + 1)
  }

  return {
    holidayData,
    viewYear,
    viewMonth,
    result,
    isCurrentMonth,
    refreshHolidayData,
    shiftMonth,
    goToday,
  }
}
