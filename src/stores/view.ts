import { reactive, watch } from 'vue'
import type { ViewState } from '@/core/view'
import { clampSelectedDate, sanitizeView } from '@/core/view'
import { fromYmd } from '@/core/dates'
import { onStorageChange, readJson, writeJson } from '@/core/storage'

const STORAGE_KEY = 'workday-pay:view'

/** 查看的月份与选中的日期,刷新后保持不变 */
export const view = reactive<ViewState>(
  sanitizeView(readJson<unknown>(STORAGE_KEY, null), new Date()),
)

watch(
  view,
  (value) => {
    writeJson(STORAGE_KEY, value)
  },
  { deep: true },
)

/** 其他标签页切换月份或选中日期时同步过来 */
onStorageChange(STORAGE_KEY, () => {
  Object.assign(view, sanitizeView(readJson<unknown>(STORAGE_KEY, null), new Date()))
})

/** 切换到指定月份,选中日期沿用原来的日号 */
export function setViewMonth(year: number, month: number): void {
  view.year = year
  view.month = month
  view.selectedDate = clampSelectedDate(year, month, view.selectedDate)
}

/** 选中某一天,并把视图同步到该日期所在的月份 */
export function selectViewDate(ymd: string): void {
  const date = fromYmd(ymd)
  view.year = date.getFullYear()
  view.month = date.getMonth() + 1
  view.selectedDate = ymd
}
