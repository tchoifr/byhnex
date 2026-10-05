// Shared navigation, still the original script until the sidebar moves to Vue.
import '../../../../sidebar.js'
import { createApp } from 'vue'
import HomePage from './HomePage.vue'

createApp(HomePage).mount('main.bn-main')
