/**
 * Modelo de datos y persistencia.
 *
 * Una sesión es una tupla:
 * [id, inicio (s), fin (s), etiqueta, completada, tarea, bloque, actualización (ms), borrada]
 * Las sesiones eliminadas se conservan como marca de borrado para propagar el cambio al sincronizar.
 */
import { load, save, migrateLegacyKeys } from './storage.js';
import { emit } from './bus.js';
import { uid } from './util.js';

export const F = Object.freeze({ ID: 0, START: 1, END: 2, TAG: 3, DONE: 4, TASK: 5, BLOCK: 6, UPD: 7, DEL: 8 });

export const DEFAULTS = Object.freeze({
  focus: 25, short: 5, long: 15, every: 4, goal: 120,
  auto: false, notify: false, wake: true, smartClose: true, streaks: true,
  soundOn: true, sound: 'chime', vol: 0.4,
  accent: '#F7D154', mode: 'auto', reduceMotion: false, highContrast: false,
  tags: ['General'], tag: 'General', task: null, plansDone: 0, ts: 0, ver: 4,
});

export const db = { cfg: { ...DEFAULTS }, ses: [], tasks: [], presets: [], plan: null, badges: {}, epoch: 0 };

/** Valida y completa una sesión recibida de almacenamiento o de una copia externa. */
export function normalizeSession(r) {
  if (!Array.isArray(r) || r.length < 5) return null;
  const start = Number(r[1]);
  const end = Number(r[2]);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return [String(r[0]), start, end, String(r[3]).slice(0, 24), r[4] ? 1 : 0, r[5] ?? null, r[6] ?? null, Number(r[7]) || end * 1000, r[8] ? 1 : 0];
}

export function init() {
  migrateLegacyKeys();
  db.cfg = { ...DEFAULTS, ...load('cfg', {}), ver: DEFAULTS.ver };
  if (!Array.isArray(db.cfg.tags) || !db.cfg.tags.length) db.cfg.tags = ['General'];
  if (!db.cfg.tags.includes(db.cfg.tag)) db.cfg.tag = db.cfg.tags[0];
  db.ses = load('ses', []).map(normalizeSession).filter(Boolean);
  db.tasks = load('tasks', []);
  db.presets = load('presets', []);
  db.plan = load('plan', null);
  db.badges = load('badges', {});
  db.epoch = load('epoch', 0);
}

/** Guarda una colección y notifica el cambio. */
export function persist(key) {
  save(key, db[key]);
  emit(`change:${key}`);
}

export function saveCfg() {
  db.cfg.ts = Date.now();
  persist('cfg');
}

export const liveSessions = () => db.ses.filter((r) => !r[F.DEL]);

export function addSession({ start, end, tag, done = 0, task = null, block = null }) {
  const r = [uid(), start, end, tag, done ? 1 : 0, task, block, Date.now(), 0];
  db.ses.push(r);
  persist('ses');
  return r;
}

export function updateSession(id, patch) {
  const r = db.ses.find((s) => s[F.ID] === id);
  if (!r) return null;
  if ('start' in patch) r[F.START] = patch.start;
  if ('end' in patch) r[F.END] = patch.end;
  if ('tag' in patch) r[F.TAG] = patch.tag;
  if ('done' in patch) r[F.DONE] = patch.done ? 1 : 0;
  r[F.UPD] = Date.now();
  persist('ses');
  return r;
}

export function removeSession(id) {
  const r = db.ses.find((s) => s[F.ID] === id);
  if (!r) return;
  r[F.DEL] = 1;
  r[F.UPD] = Date.now();
  persist('ses');
}

/** Borra el historial. La época permite que otros dispositivos adopten el borrado al sincronizar. */
export function wipeHistory() {
  db.ses.length = 0;
  db.epoch = Date.now();
  persist('epoch');
  persist('ses');
  emit('wipe');
}

/** Fusiona sesiones por identificador; prevalece la versión con actualización más reciente. */
export function mergeSessions(list) {
  let added = 0;
  const index = new Map(db.ses.map((r) => [r[F.ID], r]));
  for (const raw of list ?? []) {
    const r = normalizeSession(raw);
    if (!r) continue;
    const own = index.get(r[F.ID]);
    if (!own) {
      db.ses.push(r);
      index.set(r[F.ID], r);
      added++;
    } else if (r[F.UPD] > own[F.UPD] || (r[F.UPD] === own[F.UPD] && r[F.DEL] && !own[F.DEL])) {
      own.splice(0, own.length, ...r);
    }
  }
  return added;
}

function mergeById(local, remote) {
  const index = new Map(local.map((x) => [x.id, x]));
  for (const item of remote ?? []) {
    if (!item || !item.id) continue;
    const own = index.get(item.id);
    if (!own) local.push({ ...item });
    else if ((item.u || 0) > (own.u || 0)) Object.assign(own, item);
  }
}

export const snapshot = () => ({
  v: 4, app: 'AstraTime', at: Date.now(), epoch: db.epoch,
  cfg: db.cfg, ses: db.ses, tasks: db.tasks, presets: db.presets, badges: db.badges,
});

/**
 * Integra una copia externa. Con `sync` se respeta la época de borrado y prevalece la
 * configuración más reciente; sin `sync` (importación) solo se añade contenido.
 * @returns {number} sesiones nuevas incorporadas
 */
export function mergeSnapshot(remote, { sync = false } = {}) {
  if (!remote || typeof remote !== 'object') return 0;
  const remoteEpoch = Number(remote.epoch) || 0;
  if (sync && remoteEpoch > db.epoch) {
    db.ses.length = 0;
    db.epoch = remoteEpoch;
  }
  const added = !sync || remoteEpoch >= db.epoch ? mergeSessions(remote.ses) : 0;
  mergeById(db.tasks, remote.tasks);
  mergeById(db.presets, remote.presets);
  for (const [k, v] of Object.entries(remote.badges ?? {})) if (!(k in db.badges)) db.badges[k] = v;
  const tags = [...(remote.tags ?? []), ...(remote.cfg?.tags ?? [])];
  for (const t of tags) if (typeof t === 'string' && t && !db.cfg.tags.includes(t)) db.cfg.tags.push(t.slice(0, 24));
  if (sync && remote.cfg && (remote.cfg.ts || 0) > (db.cfg.ts || 0)) {
    db.cfg = { ...DEFAULTS, ...remote.cfg, tags: db.cfg.tags };
  }
  ['ses', 'tasks', 'presets', 'badges', 'cfg', 'epoch'].forEach(persist);
  return added;
}
