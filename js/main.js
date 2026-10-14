/** Punto de entrada: inicialización, navegación, atajos de teclado, modo inmersivo e instalación. */
import * as data from './data.js';
import { db, persist } from './data.js';
import { on } from './bus.js';
import { $, $$, debounce, fmtDate } from './util.js';
import { icon } from './icons.js';
import { play } from './audio.js';
import * as timer from './timer.js';
import { renderTimer, renderTagPicker } from './timer-ui.js';
import { initTheme, applyTheme } from './theme.js';
import { enhanceDialog, bindPopover, toast, announce } from './dialogs.js';
import * as plans from './plans.js';
import * as tasks from './tasks.js';
import { initClosing } from './closing.js';
import { renderPanel, initPanel } from './panel.js';
import { renderCalendar, initCalendar, refreshOpenDay } from './calendar.js';
import { checkBadges, renderBadges, renderSky } from './badges.js';
import { initMusic } from './music.js';
import { initDrive } from './drive.js';
import { initBackup } from './backup.js';
import { initSettings, applySettings, renderTags } from './settings.js';
import { initFx } from './fx.js';

const VIEWS = ['timer', 'panel', 'goals', 'set'];
let view = 'timer';
let immersive = false;

/* ---------- Vistas ---------- */

function renderView() {
  if (view === 'panel') { renderPanel(); renderCalendar(); }
  if (view === 'goals') { renderBadges(); renderSky(); }
}

function showView(name) {
  view = name;
  for (const v of VIEWS) $(`#v-${v}`).hidden = v !== name;
  $$('#dock button').forEach((b) => b.setAttribute('aria-current', b.dataset.v === name ? 'page' : 'false'));
  renderView();
  const section = $(`#v-${name}`);
  section.classList.remove('view-in');
  void section.offsetWidth;
  section.classList.add('view-in');
  scrollTo(0, 0);
}

/** Actualiza los componentes dependientes de los datos. Agrupa ráfagas de cambios. */
const refresh = debounce(() => {
  applyTheme();
  renderTimer();
  renderTagPicker(pickTag);
  renderTags();
  plans.renderStrip();
  plans.renderPresetMenu();
  plans.renderPresetSettings();
  tasks.render();
  renderView();
  refreshOpenDay();
  if (!document.activeElement?.closest('#v-set input, #v-set select')) applySettings();
  for (const badge of checkBadges()) toast(`Hito desbloqueado: ${badge.name}`);
}, 80);

function pickTag(tag) {
  timer.setTag(tag);
  $('#tagpick').hidden = true;
  $('#taskbtn').setAttribute('aria-expanded', 'false');
}

/* ---------- Modo inmersivo ---------- */

function setImmersive(on_) {
  immersive = on_;
  document.body.classList.toggle('immersive', on_);
  $('#btn-immersive').setAttribute('aria-pressed', String(on_));
  $('#imm-exit').hidden = !on_;
  if (on_) { showView('timer'); announce('Modo inmersivo activado. Pulsa Escape para salir.'); }
}

/* ---------- Atajos de teclado ---------- */

function onKey(e) {
  if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
  if (document.querySelector('dialog[open]') || e.target.closest?.('input, textarea, select, [contenteditable]')) return;
  const key = e.key.toLowerCase();
  if (e.code === 'Space') {
    if (e.target.closest?.('button, summary, a')) return;
    e.preventDefault();
    timer.toggle();
  } else if (key === 's') timer.skip();
  else if (key === 'r') timer.restart();
  else if (key === 'm') setImmersive(!immersive);
  else if (key === 't') { timer.nextTag(); announce(`Etiqueta: ${db.cfg.tag}`); }
  else if (key === 'escape' && immersive) setImmersive(false);
  else if (/^[1-4]$/.test(key)) showView(VIEWS[Number(key) - 1]);
}

/* ---------- Avisos de fin de fase ---------- */

function alertPhaseEnd({ ended }) {
  const text = ended === 'focus' ? 'Sesión de enfoque terminada' : 'Pausa terminada';
  if (db.cfg.soundOn) play(db.cfg.sound, db.cfg.vol);
  announce(text);
  if (!db.cfg.notify) return;
  try { navigator.vibrate?.([200, 100, 200]); } catch { /* no soportado */ }
  if ('Notification' in window && Notification.permission === 'granted') {
    try { new Notification(text); } catch { /* notificaciones bloqueadas */ }
  }
}

/* ---------- Inicio ---------- */

function bindStatic() {
  $$('[data-icon]').forEach((el) => { el.innerHTML = icon(el.dataset.icon, Number(el.dataset.size) || 20); });
  $$('dialog').forEach(enhanceDialog);
  $('#dock').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) showView(b.dataset.v); });
  $('#taskbtn').addEventListener('click', () => {
    const picker = $('#tagpick');
    picker.hidden = !picker.hidden;
    $('#taskbtn').setAttribute('aria-expanded', String(!picker.hidden));
  });
  $('#tabs').addEventListener('click', (e) => { if (e.target.dataset.m) timer.setMode(e.target.dataset.m); });
  $('#go').addEventListener('click', timer.toggle);
  $('#skip').addEventListener('click', timer.skip);
  $('#reset').addEventListener('click', timer.restart);
  $('#ring').addEventListener('click', () => { if (immersive) timer.toggle(); });
  $('#btn-immersive').addEventListener('click', () => setImmersive(!immersive));
  $('#imm-exit').addEventListener('click', () => setImmersive(false));

  $('#q-repeat').addEventListener('click', () => { if (!timer.repeatLast()) toast('Todavía no hay sesiones que repetir.'); });
  $('#q-tag').addEventListener('click', () => { timer.nextTag(); announce(`Etiqueta: ${db.cfg.tag}`); });
  const presetPopover = bindPopover($('#q-presets'), $('#pop-presets'), plans.renderPresetMenu);
  $('#preset-menu').addEventListener('click', (e) => {
    const item = e.target.closest('button');
    if (!item) return;
    presetPopover.close();
    if (item.dataset.new) { plans.openBuilder(); return; }
    const preset = plans.presets().find((p) => p.id === item.dataset.id);
    if (preset) plans.begin(preset.blocks, preset.name);
  });
  $('#pr-new').addEventListener('click', () => plans.openBuilder());

  document.addEventListener('keydown', onKey);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) persist('ses'); else timer.tick();
  });
  addEventListener('pagehide', () => persist('ses'));

  let installEvent = null;
  addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvent = e; $('#inst').hidden = false; });
  addEventListener('appinstalled', () => { $('#inst').hidden = true; });
  $('#inst').addEventListener('click', async () => {
    if (!installEvent) return;
    installEvent.prompt();
    try { await installEvent.userChoice; } catch { /* instalación cancelada */ }
    installEvent = null;
    $('#inst').hidden = true;
  });
}

function tickClock() {
  const now = new Date();
  $('#clock').textContent = now.toLocaleTimeString('es-ES');
  $('#date').textContent = fmtDate(now, { weekday: 'long', day: 'numeric', month: 'long' });
}

function start() {
  data.init();
  initTheme();
  applyTheme();
  timer.init();
  bindStatic();
  initSettings();
  initPanel();
  initCalendar();
  tasks.initTasks();
  plans.initPlans();
  initClosing();
  initMusic();
  initDrive();
  initBackup();
  initFx();
  applySettings();

  let lastRem = -1;
  on('timer:state', () => { lastRem = -1; renderTimer(); });
  on('timer:tick', () => { if (timer.st.rem !== lastRem) { lastRem = timer.st.rem; renderTimer(); } });
  on('phase:end', alertPhaseEnd);
  on('plan:begin', () => { timer.startPlanned(); showView('timer'); });
  on('plan:done', (name) => toast(`Plan completado${name ? `: ${name}` : ''}.`));
  on('task:select', (task) => { if (task.tag !== db.cfg.tag) timer.setTag(task.tag); });
  on('wipe', timer.afterWipe);
  for (const key of ['ses', 'tasks', 'plan', 'presets', 'cfg', 'badges']) on(`change:${key}`, refresh);

  checkBadges();
  showView('timer');
  refresh();
  tickClock();
  setInterval(tickClock, 1000);
  setInterval(timer.tick, 250);

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* el modo sin conexión no estará disponible */ });
  }
}

start();
