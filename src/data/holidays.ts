import bundled from './holidays.json'
import { BUNDLED_SOURCE, BUNDLED_VERSION } from './holidays-source'
import type { HolidayData, HolidayYear } from '@/core/types'
import { readJson, writeJson } from '@/core/storage'

const STORAGE_KEY = 'workday-pay:holidays:extra'
const CDN_BASE = 'https://cdn.jsdelivr.net/npm/chinese-days@latest/dist/years'

const payload = bundled as unknown as HolidayData

function readExtra(): HolidayData {
  const parsed = readJson<HolidayData | null>(STORAGE_KEY, null)
  return parsed && typeof parsed === 'object' ? parsed : {}
}

function writeExtra(data: HolidayData): void {
  // 存储不可用时静默降级为仅内置数据
  writeJson(STORAGE_KEY, data)
}

/** 内置数据 + 本地缓存的在线补充数据 */
export function allHolidayData(): HolidayData {
  return { ...payload, ...readExtra() }
}

export function bundledYears(): number[] {
  return Object.keys(payload)
    .map(Number)
    .sort((a, b) => a - b)
}

export function hasYear(data: HolidayData, year: number): boolean {
  return Boolean(data[String(year)])
}

interface RemoteYear {
  holidays?: Record<string, string>
  workdays?: Record<string, string>
  inLieuDays?: Record<string, string>
}

/**
 * 从 CDN 拉取指定年份的放假安排。
 * chinese-days 的年度文件结构为 {holidays, workdays, inLieuDays},
 * 值形如 "Spring Festival,春节,4",取其中文名。
 */
export async function fetchYear(year: number): Promise<HolidayYear> {
  const response = await fetch(`${CDN_BASE}/${year}.json`, {
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) {
    throw new Error(`无法获取 ${year} 年放假安排 (HTTP ${response.status})`)
  }
  const remote = (await response.json()) as RemoteYear
  return {
    holidays: pickChineseName(remote.holidays),
    workdays: pickChineseName(remote.workdays),
    inLieu: pickChineseName(remote.inLieuDays),
  }
}

function pickChineseName(record?: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [date, value] of Object.entries(record ?? {})) {
    const parts = String(value).split(',')
    out[date] = parts[1] || parts[0] || ''
  }
  return out
}

/** 在线补充指定年份,成功后写入本地缓存 */
export async function updateYear(year: number): Promise<HolidayYear> {
  const yearData = await fetchYear(year)
  const extra = readExtra()
  extra[String(year)] = yearData
  writeExtra(extra)
  return yearData
}

export const bundledVersion = BUNDLED_VERSION
export const bundledSource = BUNDLED_SOURCE
