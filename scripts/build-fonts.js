/**
 * 字体分片构建脚本 (Text PRD Phase 0)
 *
 * 使用 cn-font-split 将 TTF/OTF 字体切片为 woff2 + result.css，
 * 实现基于 unicode-range 的按需加载。
 *
 * 用法: npm run fonts:build
 *
 * 前置条件:
 *   1. 原始字体文件放在 fonts-source/<fontdir>/ 下
 *   2. 每个字体目录需包含一个 .ttf 或 .otf 文件和 OFL.txt
 *
 * 输出: public/fonts/<fontdir>/result.css + woff2 分片 + OFL.txt
 */

import { execSync } from 'child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs'
import { basename, join, resolve } from 'path'

const ROOT = resolve(import.meta.dirname, '..')
const FONTS_SOURCE = join(ROOT, 'fonts-source')
const FONTS_OUTPUT = join(ROOT, 'public', 'fonts')

/** 预置字体清单 */
const FONT_CONFIGS = [
    {
        dir: 'noto-sans-sc',
        fontFamily: 'Noto Sans SC',
        description: 'Google Noto Sans SC - 默认无衬线字体',
    },
    {
        dir: 'noto-serif-sc',
        fontFamily: 'Noto Serif SC',
        description: 'Google Noto Serif SC - 衬线字体',
    },
    {
        dir: 'lxgw-wenkai',
        fontFamily: 'LXGW WenKai',
        description: '霞鹜文楷 - 文艺手写风格',
    },
    {
        dir: 'zcool-qingke-huangyou',
        fontFamily: 'ZCOOL QingKe HuangYou',
        description: '站酷庆科黄油体 - 活泼标题',
    },
    {
        dir: 'ma-shan-zheng',
        fontFamily: 'Ma Shan Zheng',
        description: '马善政毛笔楷书 - 国风标题',
    },
]

function findFontFile(dir) {
    const files = readdirSync(dir)
    const fontFile = files.find(f => /\.(ttf|otf)$/i.test(f))
    return fontFile ? join(dir, fontFile) : null
}

async function buildFont(config) {
    const sourceDir = join(FONTS_SOURCE, config.dir)
    const outputDir = join(FONTS_OUTPUT, config.dir)

    if (!existsSync(sourceDir)) {
        console.warn(`⚠️  跳过 ${config.fontFamily}: 源目录不存在 (${sourceDir})`)
        return false
    }

    const fontFile = findFontFile(sourceDir)
    if (!fontFile) {
        console.warn(`⚠️  跳过 ${config.fontFamily}: 未找到 .ttf/.otf 文件`)
        return false
    }

    console.log(`\n📦 正在分片: ${config.fontFamily}`)
    console.log(`   源文件: ${basename(fontFile)}`)
    console.log(`   输出目录: ${outputDir}`)

    // 确保输出目录存在
    mkdirSync(outputDir, { recursive: true })

    try {
        // 使用 npx 调用 cn-font-split（无需全局安装）
        const cmd = [
            'npx', '-y', 'cn-font-split',
            '-i', `"${fontFile}"`,
            '-o', `"${outputDir}"`,
            '--font-family', `"${config.fontFamily}"`,
        ].join(' ')

        execSync(cmd, {
            stdio: 'inherit',
            cwd: ROOT,
            env: { ...process.env },
        })

        // 复制 OFL.txt 到输出目录
        const oflSource = join(sourceDir, 'OFL.txt')
        const oflTarget = join(outputDir, 'OFL.txt')
        if (existsSync(oflSource)) {
            cpSync(oflSource, oflTarget)
            console.log(`   ✅ 已复制 OFL.txt`)
        } else {
            console.warn(`   ⚠️  未找到 OFL.txt，请手动添加许可证文件`)
        }

        // 统计输出
        const outputFiles = readdirSync(outputDir)
        const woff2Count = outputFiles.filter(f => f.endsWith('.woff2')).length
        const totalSize = outputFiles.reduce((sum, f) => {
            const filePath = join(outputDir, f)
            return sum + (statSync(filePath).isFile() ? statSync(filePath).size : 0)
        }, 0)
        console.log(`   ✅ 完成: ${woff2Count} 个 woff2 分片, 总计 ${(totalSize / 1024 / 1024).toFixed(2)} MB`)

        return true
    } catch (err) {
        console.error(`   ❌ 分片失败: ${err.message}`)
        return false
    }
}

async function main() {
    console.log('🔤 字体分片构建工具 (cn-font-split)')
    console.log('=' .repeat(50))

    if (!existsSync(FONTS_SOURCE)) {
        console.error(`\n❌ 源目录不存在: ${FONTS_SOURCE}`)
        console.log('\n请按以下结构准备字体文件:')
        console.log('  fonts-source/')
        for (const config of FONT_CONFIGS) {
            console.log(`    ${config.dir}/`)
            console.log(`      <font>.ttf (或 .otf)`)
            console.log(`      OFL.txt`)
        }
        process.exit(1)
    }

    let success = 0
    let skipped = 0

    for (const config of FONT_CONFIGS) {
        const result = await buildFont(config)
        if (result) success++
        else skipped++
    }

    console.log('\n' + '='.repeat(50))
    console.log(`📊 结果: ${success} 成功, ${skipped} 跳过`)

    if (success > 0) {
        console.log('\n✅ 字体分片已生成到 public/fonts/')
        console.log('   构建产物已包含在 Git 仓库中')
    }
}

main().catch(console.error)
