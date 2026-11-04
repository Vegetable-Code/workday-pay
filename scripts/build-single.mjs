/**
 * 把 dist/ 的产物内联成单个 HTML 文件,方便直接丢到任意静态托管。
 *
 * 前提:先跑过 `vite build`,产物在 dist/,且只有一个 JS chunk 与一个 CSS 文件
 * (本项目没有动态 import,也没有外部字体/图片资源)。
 *
 * 输出:dist-single/index.html
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const distDir = join(root, 'dist')
const outDir = join(root, 'dist-single')
const outFile = join(outDir, 'index.html')

if (!existsSync(join(distDir, 'index.html'))) {
  console.error('[build-single] 找不到 dist/index.html,请先运行 `npm run build`')
  process.exit(1)
}

let html = readFileSync(join(distDir, 'index.html'), 'utf8')

/** 读取 dist 下的资源文件内容;路径相对 index.html */
function readAsset(url) {
  const clean = url.split(/[?#]/)[0].replace(/^\.?\//, '')
  const file = join(distDir, clean)
  if (!existsSync(file)) {
    console.error(`[build-single] 资源缺失:${url}`)
    process.exit(1)
  }
  return readFileSync(file, 'utf8')
}

/** 内联脚本里的 `</script` 会提前闭合标签,转义成等价的转义写法 */
function escapeScript(code) {
  return code.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--')
}

const cssTag = html.match(/<link\b[^>]*\brel=["']stylesheet["'][^>]*>/i)
const jsTag = html.match(/<script\b[^>]*\bsrc=["'][^"']+["'][^>]*>\s*<\/script>/i)

if (!cssTag || !jsTag) {
  console.error('[build-single] dist/index.html 结构不符合预期(缺少 CSS link 或 JS script)')
  process.exit(1)
}

const cssHref = cssTag[0].match(/\bhref=["']([^"']+)["']/i)?.[1]
const jsSrc = jsTag[0].match(/\bsrc=["']([^"']+)["']/i)?.[1]

if (!cssHref || !jsSrc) {
  console.error('[build-single] 无法解析 CSS/JS 路径')
  process.exit(1)
}

const css = readAsset(cssHref)
const js = readAsset(jsSrc)

// 必须用函数式替换:替换串里的 `$&` / `$` 等有特殊含义,
// 直接传字符串会把匹配到的 HTML 片段插进产物里。
html = html.replace(cssTag[0], () => `<style>\n${css}\n</style>`)
html = html.replace(jsTag[0], () => `<script type="module">\n${escapeScript(js)}\n</script>`)

// 去掉可能残留的 modulepreload 预载链接(单文件里没有意义)
html = html.replace(/<link\b[^>]*\brel=["']modulepreload["'][^>]*>/gi, () => '')

rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })
writeFileSync(outFile, html, 'utf8')

const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1)
console.log(`[build-single] 已生成 ${outFile}(${kb} KB,单文件)`)
