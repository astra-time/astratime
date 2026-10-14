/* Aplica tema, contraste y movimiento antes del primer pintado para evitar parpadeos. */
(function () {
  var root = document.documentElement;
  try {
    var cfg = JSON.parse(localStorage.getItem('astratime.cfg') || localStorage.getItem('pomo.cfg') || '{}');
    var mode = cfg.mode || 'auto';
    var light = mode === 'light' || (mode === 'auto' && matchMedia('(prefers-color-scheme: light)').matches);
    root.dataset.theme = light ? 'light' : 'dark';
    if (/^#[0-9a-f]{6}$/i.test(cfg.accent)) root.style.setProperty('--acc', cfg.accent);
    if (cfg.highContrast) root.dataset.contrast = 'high';
    if (cfg.reduceMotion || matchMedia('(prefers-reduced-motion: reduce)').matches) root.dataset.motion = 'reduced';
  } catch (e) {
    root.dataset.theme = 'dark';
  }
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) root.dataset.motion = 'reduced';
})();
