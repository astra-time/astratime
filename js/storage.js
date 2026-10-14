/** Acceso a localStorage con espacio de nombres y tolerancia a fallos. */
const NS = 'astratime.';
const LEGACY_NS = 'pomo.';

/** Copia las claves del prefijo anterior (`pomo.*`) cuando aún no existen con el prefijo actual. */
export function migrateLegacyKeys() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(LEGACY_NS)) continue;
      const next = NS + key.slice(LEGACY_NS.length);
      if (localStorage.getItem(next) === null) localStorage.setItem(next, localStorage.getItem(key));
    }
  } catch { /* sin acceso al almacenamiento */ }
}

export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(NS + key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(NS + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function remove(key) {
  try { localStorage.removeItem(NS + key); } catch { /* sin acceso al almacenamiento */ }
}
