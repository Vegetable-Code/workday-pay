/**
 * 临时核算脚本:打印各年工作日天数与明细,用于核对断言。
 * 运行: node scripts/check-workdays.mjs 2025 2026
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const data = JSON.parse(readFileSync(resolve(root, 'src/data/holidays.json'), 'utf8'))

const years = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(data)

for (const year of years) {
  const yr = data[year] ?? { holidays: {}, workdays: {}, inLieu: {} }
  const perMonth = Array.from({ length: 12 }, () => 0)
  const makeup = []
  const weekdayHolidays = []
  let total = 0

  const cursor = new Date(Number(year), 0, 1)
  while (cursor.getFullYear() === Number(year)) {
    const s = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`
    const w = cursor.getDay()
    let work = false
    if (yr.workdays[s]) work = true
    else if (w >= 1 && w <= 5 && !yr.holidays[s]) work = true
    if (work) {
      perMonth[cursor.getMonth()] += 1
      total += 1
    }
    if (yr.workdays[s]) makeup.push(s)
    if (yr.holidays[s] && w >= 1 && w <= 5) weekdayHolidays.push(`${s}:${yr.holidays[s]}`)
    cursor.setDate(cursor.getDate() + 1)
  }

  console.log(`${year} 全年工作日 ${total}`)
  console.log(`  逐月: ${perMonth.join(' ')}`)
  console.log(`  调休补班(${makeup.length}): ${makeup.join(' ')}`)
  console.log(`  工作日放假(${weekdayHolidays.length}): ${weekdayHolidays.join(' ')}`)
}
