import { createApp } from 'vue'
import App from './App.vue'
import { initStorage } from './core/storage'
import './styles/tokens.css'
import './styles/base.css'

initStorage()
createApp(App).mount('#app')
