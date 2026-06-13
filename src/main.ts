import './style.css'
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css'

// 解决 pixi-filters 废弃 API 警告
// pixi-filters v5 内部使用 settings.FILTER_RESOLUTION，在 PixiJS v7+ 中已废弃
import { Filter } from 'pixi.js'
Filter.defaultResolution = window.devicePixelRatio || 1

import { createPinia } from 'pinia'
import { createApp } from 'vue'

import App from './App.vue'
import router from './router'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)
app.mount('#app')
