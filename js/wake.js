/** Mantiene la pantalla activa mediante la Screen Wake Lock API cuando está disponible. */
let sentinel = null;
let wanted = false;

async function acquire() {
  if (!('wakeLock' in navigator) || sentinel || document.visibilityState !== 'visible') return;
  try {
    sentinel = await navigator.wakeLock.request('screen');
    sentinel.addEventListener('release', () => { sentinel = null; });
  } catch { /* denegado o no soportado */ }
}

async function release() {
  try { await sentinel?.release(); } catch { /* ya liberado */ }
  sentinel = null;
}

export function setWake(on) {
  wanted = on;
  return on ? acquire() : release();
}

/** El navegador libera el bloqueo al ocultar la pestaña; se solicita de nuevo al volver. */
document.addEventListener('visibilitychange', () => { if (wanted) acquire(); });
