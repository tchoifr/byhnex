// Shared navigation, still the original script until the sidebar moves to Vue.
import '../../../../sidebar.js'
import { createApp } from 'vue'
import SubscriptionPage from './SubscriptionPage.vue'

createApp(SubscriptionPage).mount('main.bn-main')
