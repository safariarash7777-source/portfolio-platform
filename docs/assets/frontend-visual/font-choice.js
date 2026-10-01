// Set before stylesheet discovery. Only the selected local font is preloaded.
(() => {
  const choice = new URL(location.href).searchParams.get('font') === 'b' ? 'b' : 'a';
  document.documentElement.dataset.font = choice;
  const preload = document.createElement('link');
  preload.rel = 'preload'; preload.as = 'font'; preload.type = 'font/woff2'; preload.crossOrigin = 'anonymous';
  preload.href = `fonts/${choice === 'b' ? 'Estedad' : 'Vazirmatn'}-Variable.woff2`;
  document.head.append(preload);
  window.reviewShifts = [];
  if ('PerformanceObserver' in window) new PerformanceObserver(list => {
    for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.reviewShifts.push(entry.value);
  }).observe({type: 'layout-shift', buffered: true});
})();
