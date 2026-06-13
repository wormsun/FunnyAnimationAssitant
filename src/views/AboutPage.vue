<template>
  <div class="about-page">
    <div class="about-container">
      <header class="about-header">
        <router-link
          to="/project"
          class="back-link"
        >
          ← 返回
        </router-link>
        <h1>关于 沙雕动画小助手</h1>
        <p class="subtitle">
          版本信息与第三方许可证
        </p>
      </header>

      <section class="about-section">
        <h2>应用信息</h2>
        <div class="info-card">
          <div class="info-row">
            <span class="info-label">产品名称</span>
            <span class="info-value">沙雕动画小助手</span>
          </div>
          <div class="info-row">
            <span class="info-label">版本</span>
            <span class="info-value">ver2.0.0</span>
          </div>
        </div>
      </section>

      <section class="about-section">
        <h2>第三方字体许可证</h2>
        <p class="section-desc">
          本产品使用以下开源字体，均基于 SIL Open Font License 1.1 许可证授权。
          点击「查看许可证全文」可查看各字体的完整许可证文本。
        </p>

        <div
          v-if="loading"
          class="loading"
        >
          加载中...
        </div>

        <div
          v-for="font in fonts"
          :key="font.name"
          class="font-card"
        >
          <div class="font-card-header">
            <div class="font-name">
              {{ font.name }}
            </div>
            <a
              :href="font.url"
              target="_blank"
              rel="noopener noreferrer"
              class="font-link"
            >
              官方页面 ↗
            </a>
          </div>

          <div class="font-meta">
            <span class="font-author">{{ font.author }}</span>
            <span class="font-separator">·</span>
            <span class="font-version">{{ font.version }}</span>
            <span class="font-separator">·</span>
            <span class="font-license">{{ font.license }}</span>
          </div>

          <p class="font-desc">
            {{ font.description }}
          </p>

          <div class="font-actions">
            <button
              class="license-toggle"
              @click="toggleLicense(font.name)"
            >
              {{ expandedLicenses.has(font.name) ? '收起许可证全文' : '查看许可证全文' }}
            </button>
          </div>

          <div
            v-if="expandedLicenses.has(font.name)"
            class="license-content"
          >
            <pre v-if="licenseTexts[font.name]">{{ licenseTexts[font.name] }}</pre>
            <div
              v-else
              class="license-loading"
            >
              加载许可证...
            </div>
          </div>
        </div>
      </section>

      <footer class="about-footer">
        <p>
          所有字体均遵循各自的开源许可证条款。如有版权疑问，请联系我们。
        </p>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'

interface FontLicense {
    name: string
    version: string
    license: string
    licenseFile: string
    author: string
    url: string
    description: string
}

const fonts = ref<FontLicense[]>([])
const loading = ref(true)
const expandedLicenses = reactive(new Set<string>())
const licenseTexts = reactive<Record<string, string>>({})

// 加载字体许可证数据
async function loadFontLicenses() {
    try {
        const res = await fetch('/fonts/font-licenses.json')
        fonts.value = await res.json() as FontLicense[]
    } catch (e) {
        console.error('[AboutPage] 加载字体许可证失败:', e)
    } finally {
        loading.value = false
    }
}

async function toggleLicense(fontName: string) {
    if (expandedLicenses.has(fontName)) {
        expandedLicenses.delete(fontName)
        return
    }

    expandedLicenses.add(fontName)

    // 懒加载 OFL.txt
    if (!licenseTexts[fontName]) {
        const font = fonts.value.find(f => f.name === fontName)
        if (font?.licenseFile) {
            try {
                const res = await fetch(font.licenseFile)
                licenseTexts[fontName] = await res.text()
            } catch (e) {
                licenseTexts[fontName] = '无法加载许可证文本'
                console.error(`[AboutPage] 加载 ${fontName} OFL.txt 失败:`, e)
            }
        }
    }
}

void loadFontLicenses()
</script>

<style scoped>
.about-page {
    min-height: 100vh;
    background: #f5f7fa;
    color: #1f2937;
    padding: 40px 20px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.about-container {
    max-width: 720px;
    margin: 0 auto;
}

.about-header {
    margin-bottom: 48px;
}

.back-link {
    color: #6b7280;
    text-decoration: none;
    font-size: 14px;
    display: inline-block;
    margin-bottom: 16px;
    transition: color 0.2s;
}

.back-link:hover {
    color: #374151;
}

.about-header h1 {
    font-size: 28px;
    font-weight: 700;
    margin: 0 0 8px 0;
    color: #111827;
}

.subtitle {
    color: #6b7280;
    font-size: 15px;
    margin: 0;
}

.about-section {
    margin-bottom: 40px;
}

.about-section h2 {
    font-size: 18px;
    font-weight: 600;
    color: #374151;
    margin: 0 0 16px 0;
    padding-bottom: 8px;
    border-bottom: 1px solid #e5e7eb;
}

.section-desc {
    color: #6b7280;
    font-size: 14px;
    line-height: 1.6;
    margin: 0 0 20px 0;
}

.info-card {
    background: #ffffff;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 16px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}

.info-row {
    display: flex;
    justify-content: space-between;
    padding: 8px 0;
}

.info-row + .info-row {
    border-top: 1px solid #f3f4f6;
}

.info-label {
    color: #6b7280;
    font-size: 14px;
}

.info-value {
    color: #111827;
    font-size: 14px;
    font-weight: 500;
}

.loading {
    text-align: center;
    color: #9ca3af;
    padding: 20px;
}

.font-card {
    background: #ffffff;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 20px;
    margin-bottom: 12px;
    transition: border-color 0.2s, box-shadow 0.2s;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}

.font-card:hover {
    border-color: #d1d5db;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.font-card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
}

.font-name {
    font-size: 16px;
    font-weight: 600;
    color: #111827;
}

.font-link {
    color: #3b82f6;
    text-decoration: none;
    font-size: 13px;
    transition: color 0.2s;
}

.font-link:hover {
    color: #2563eb;
}

.font-meta {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: #6b7280;
    margin-bottom: 8px;
}

.font-separator {
    color: #d1d5db;
}

.font-desc {
    font-size: 14px;
    color: #4b5563;
    margin: 0 0 12px 0;
    line-height: 1.5;
}

.font-actions {
    margin-top: 8px;
}

.license-toggle {
    background: none;
    border: 1px solid #d1d5db;
    color: #3b82f6;
    padding: 6px 14px;
    border-radius: 4px;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.2s;
}

.license-toggle:hover {
    background: #eff6ff;
    border-color: #93c5fd;
    color: #2563eb;
}

.license-content {
    margin-top: 12px;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 4px;
    padding: 16px;
    max-height: 400px;
    overflow-y: auto;
}

.license-content pre {
    margin: 0;
    font-family: 'Consolas', 'Monaco', monospace;
    font-size: 12px;
    line-height: 1.6;
    color: #4b5563;
    white-space: pre-wrap;
    word-break: break-word;
}

.license-loading {
    color: #9ca3af;
    font-size: 13px;
    text-align: center;
    padding: 12px;
}

.about-footer {
    margin-top: 48px;
    padding-top: 24px;
    border-top: 1px solid #e5e7eb;
    text-align: center;
}

.about-footer p {
    color: #9ca3af;
    font-size: 13px;
    margin: 0;
}
</style>
