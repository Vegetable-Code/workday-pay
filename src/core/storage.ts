import { ref } from 'vue'

const PROBE_KEY = 'workday-pay:probe'

/** 本地存储是否可用:隐私模式、站点禁用存储或配额耗尽时写入会抛错 */
export const storageHealthy = ref(true)

function probeStorage(): boolean {
  try {
    const key = `${PROBE_KEY}:${Date.now()}`
    localStorage.setItem(key, '1')
    localStorage.removeItem(key)
    return true
  } catch {
    return false
  }
}

/** 启动时探测一次存储能力,结果写入 storageHealthy */
export function initStorage(): void {
  storageHealthy.value = probeStorage()
}

/** 读取 JSON;键不存在、数据损坏或存储不可用时返回 fallback */
export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as T
    return parsed ?? fallback
  } catch {
    return fallback
  }
}

/** 写入 JSON;失败时把存储标记为不可用 */
export function writeJson(key: string, value: unknown): boolean {
  try {
    const next = JSON.stringify(value)
    // 内容没变就不写,避免触发其他标签页的 storage 事件来回同步
    if (localStorage.getItem(key) === next) return true
    localStorage.setItem(key, next)
    storageHealthy.value = true
    return true
  } catch {
    storageHealthy.value = false
    return false
  }
}

/** 删除一个键 */
export function removeKey(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    // 存储不可用时忽略
  }
}

/**
 * 监听其他标签页对某个键的改动。
 * 非浏览器环境(单元测试、SSR)没有 window,直接跳过。
 */
export function onStorageChange(key: string, handler: () => void): void {
  if (typeof window === 'undefined') return
  window.addEventListener('storage', (event) => {
    if (event.key !== key) return
    handler()
  })
}
