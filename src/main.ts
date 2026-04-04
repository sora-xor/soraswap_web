import { createApp } from 'vue';
import App from './App.vue';
import './index.css';
import { initLiquidButtons } from './services/liquidButtons';

createApp(App).mount('#app');
initLiquidButtons();
