import { initChartProviderFilter } from './chart.js';

function boot() {
  initChartProviderFilter();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
