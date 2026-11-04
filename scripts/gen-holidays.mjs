/**
 * 从 chinese-days 提取节假日数据,压缩为项目内置格式。
 * 运行: npm run gen:holidays
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = resolve(root, 'node_modules/chinese-days/dist/chinese-days.json')
const target = resolve(root, 'src/data/holidays.json')

const raw = JSON.parse(readFileSync(source, 'utf8'))

/** 名称形如 "Spring Festival,春节,4" -> "春节" */
function shortName(value) {
  if (typeof value !== 'string') return ''
  const parts = value.split(',')
  return parts[1] || parts[0] || ''
}

function groupByYear(record) {
  const out = {}
  for (const [date, name] of Object.entries(record ?? {})) {
    const year = date.slice(0, 4)
    ;(out[year] ??= {})[date] = shortName(name)
  }
  return out
}

const holidays = groupByYear(raw.holidays)
const workdays = groupByYear(raw.workdays)
const inLieu = groupByYear(raw.inLieuDays)

const years = [...new Set([...Object.keys(holidays), ...Object.keys(workdays)])].sort()

const payload = Object.fromEntries(
  years.map((year) => [
    year,
    {
      holidays: holidays[year] ?? {},
      workdays: workdays[year] ?? {},
      inLieu: inLieu[year] ?? {},
    },
  ]),
)

function readPackageVersion() {
  const pkg = JSON.parse(
    readFileSync(resolve(root, 'node_modules/chinese-days/package.json'), 'utf8'),
  )
  return pkg.version
}

mkdirSync(dirname(target), { recursive: true })
writeFileSync(target, `${JSON.stringify(payload)}\n`, 'utf8')

const versionFile = resolve(root, 'src/data/holidays-source.ts')
writeFileSync(
  versionFile,
  `// 由 scripts/gen-holidays.mjs 自动生成,请勿手工修改\nexport const BUNDLED_SOURCE = 'chinese-days'\nexport const BUNDLED_VERSION = '${readPackageVersion()}'\n`,
  'utf8',
)

const size = Buffer.byteLength(JSON.stringify(payload))
console.log(`已生成 ${target}`)
console.log(`已生成 ${versionFile}`)
console.log(`覆盖年份: ${years[0]} - ${years[years.length - 1]} (${years.length} 年)`)
console.log(`体积: ${(size / 1024).toFixed(1)} KB`)
