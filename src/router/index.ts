import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    redirect: '/project'
  },
  {
    path: '/project',
    name: 'ProjectHome',
    component: () => import('@/views/ProjectHomePage.vue'),
    meta: { title: '项目主页' }
  },
  {
    path: '/episode/:id/edit',
    name: 'EpisodeEdit',
    component: () => import('@/views/EpisodeEditPage.vue'),
    meta: { title: '编辑动画' }
  },
  {
    path: '/assets/:type',
    name: 'AssetManager',
    component: () => import('@/views/AssetManagerPage.vue'),
    meta: { title: '素材管理' }
  },
  {
    path: '/screenplay/:episodeId',
    name: 'ScreenplayEditor',
    component: () => import('@/views/ScreenplayEditorPage.vue'),
    meta: { title: '剧本编辑' }
  },
  {
    path: '/about',
    name: 'About',
    component: () => import('@/views/AboutPage.vue'),
    meta: { title: '关于', requiresAuth: false }
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
