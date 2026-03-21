import { initQobuzChartFilter } from './chart.js';

function boot() {
  initQobuzChartFilter();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}

