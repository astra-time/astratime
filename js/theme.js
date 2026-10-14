/** Tema: modo claro u oscuro, color de acento, logotipo y favicon dinámico. */
import { db, saveCfg } from './data.js';
import { $, $$, h } from './util.js';
import { icon } from './icons.js';
import { bindPopover } from './dialogs.js';

const BG = { light: '#f4f4f1', dark: '#000000' };
const BREAK_COLOR = '#5CCFB0';
const PAUSED_COLOR = '#8E8E96';

export const PALETTES = [
  ['#DCEBFA', '#0A7BBF', '#0A3555', '#0B5580'],
  ['#E8694F', '#EFCFA6', '#2DA882', '#5A4538'],
  ['#1DBF8E', '#FFFFD5', '#082C4A', '#3C5A85'],
  ['#FF0DC8', '#3D2589', '#383850', '#F2F2F5'],
  ['#064F7A', '#00AEEF', '#FF8800', '#FFCC00'],
  ['#FF5A12', '#84BB00', '#00AEEF', '#FFB400'],
  ['#F7D154', '#FF2E93'],
];

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => { const x = rgb(a); const y = rgb(b); return toHex(x.map((v, i) => v + (y[i] - v) * t)); };
const luminance = (hex) => {
  const [r, g, b] = rgb(hex).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

/** Acerca el color al extremo opuesto del fondo hasta alcanzar la relación de contraste indicada. */
function ensureContrast(color, bg, min) {
  const target = luminance(bg) > 0.5 ? '#000000' : '#ffffff';
  let c = color;
  for (let i = 0; i < 20 && contrast(c, bg) < min; i++) c = mix(c, target, 0.08);
  return c;
}

const validColor = (c) => /^#[0-9a-f]{6}$/i.test(c ?? '');
const root = document.documentElement;
let faviconState = 'idle';
let popover = null;

export const isLight = () => db.cfg.mode === 'light' || (db.cfg.mode !== 'dark' && matchMedia('(prefers-color-scheme: light)').matches);

export function applyTheme() {
  const { cfg } = db;
  const light = isLight();
  const highContrast = cfg.highContrast || matchMedia('(prefers-contrast: more)').matches;
  root.dataset.theme = light ? 'light' : 'dark';
  root.dataset.contrast = highContrast ? 'high' : 'normal';
  root.dataset.motion = cfg.reduceMotion || matchMedia('(prefers-reduced-motion: reduce)').matches ? 'reduced' : 'full';

  const bg = light ? BG.light : BG.dark;
  let accent = validColor(cfg.accent) ? cfg.accent.toLowerCase() : '#f7d154';
  for (let i = 0; i < 12 && (light ? luminance(accent) > 0.8 : luminance(accent) < 0.06); i++) {
    accent = mix(accent, light ? '#000000' : '#ffffff', 0.1);
  }
  root.style.setProperty('--acc', accent);
  root.style.setProperty('--acc-ui', ensureContrast(accent, bg, highContrast ? 7 : 3));
  root.style.setProperty('--onacc', luminance(accent) > 0.35 ? '#000000' : '#ffffff');
  $('meta[name=theme-color]')?.setAttribute('content', bg);

  const modeBtn = $('#btn-mode');
  modeBtn.innerHTML = icon(light ? 'moon' : 'sun');
  modeBtn.setAttribute('aria-label', light ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro');
  $$('#modeseg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === cfg.mode)));
  $$('#pal .sw').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.c.toLowerCase() === String(cfg.accent).toLowerCase())));
  if (validColor(cfg.accent)) $('#c-color').value = cfg.accent.toLowerCase();
  updateFavicon();
}

/** Marcador del logotipo (circunferencia de 270° con nodos y aguja horizontal) para el favicon. */
function faviconSvg(color) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" rx="11" fill="#111"/>`
    + `<g transform="translate(24 24) scale(.82) translate(-24 -24)" fill="none" stroke="${color}" stroke-linecap="round">`
    + `<path d="M24 7A17 17 0 1 1 7 24" stroke-width="5"/><path d="M7 24H24" stroke-width="3.2"/>`
    + `<g fill="${color}" stroke="none"><circle cx="24" cy="7" r="4.4"/><circle cx="7" cy="24" r="4.4"/><circle cx="24" cy="24" r="4"/></g></g></svg>`;
}

/** Estados: idle y focus usan el acento; break usa verde menta; paused usa gris. */
export function setFaviconState(state) {
  faviconState = state;
  updateFavicon();
}

function updateFavicon() {
  const accent = getComputedStyle(root).getPropertyValue('--acc').trim() || db.cfg.accent;
  const color = faviconState === 'break' ? BREAK_COLOR : faviconState === 'paused' ? PAUSED_COLOR : accent;
  const link = $('#favicon');
  if (link) link.href = `data:image/svg+xml,${encodeURIComponent(faviconSvg(color))}`;
}

function chooseAccent(color) {
  db.cfg.accent = color;
  saveCfg();
  applyTheme();
  popover.close();
}

export function initTheme() {
  const palette = $('#pal');
  for (const group of PALETTES) {
    palette.append(h('div', { class: 'pg' }, group.map((c) => h('button', {
      class: 'sw', type: 'button', 'data-c': c, style: `background:${c}`, 'aria-label': `Color ${c}`, onclick: () => chooseAccent(c),
    }))));
  }
  popover = bindPopover($('#btn-palette'), $('#pop-theme'));
  $('#c-color').addEventListener('input', (e) => { db.cfg.accent = e.target.value; applyTheme(); });
  $('#c-color').addEventListener('change', (e) => chooseAccent(e.target.value));
  $('#btn-mode').addEventListener('click', () => { db.cfg.mode = isLight() ? 'dark' : 'light'; saveCfg(); applyTheme(); });
  $('#modeseg').addEventListener('click', (e) => {
    const mode = e.target.dataset.v;
    if (mode) { db.cfg.mode = mode; saveCfg(); applyTheme(); }
  });
  for (const query of ['(prefers-color-scheme: light)', '(prefers-contrast: more)', '(prefers-reduced-motion: reduce)']) {
    matchMedia(query).addEventListener('change', applyTheme);
  }
}
