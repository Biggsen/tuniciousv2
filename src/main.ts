import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from '@/App.vue'
import '@/assets/main.css'
import router from '@/router'
import { useAuthStore } from '@/stores/auth'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)

useAuthStore(pinia).init()

app.mount('#app')
