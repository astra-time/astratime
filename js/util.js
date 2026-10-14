/** Utilidades de DOM, tiempo y formato. */
export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

/** Crea un elemento; las propiedades `on*` se registran como listeners. */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'text') el.textContent = value;
    else if (key.startsWith('on')) el.addEventListener(key.slice(2).toLowerCase(), value);
    else el.setAttribute(key, value === true ? '' : value);
  }
  el.append(...children.flat().filter((c) => c != null && c !== false));
  return el;
}

export const pad = (n) => String(n).padStart(2, '0');
export const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const nowSec = () => Math.floor(Date.now() / 1000);
export const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
export const fmtClock = (s) => `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
export const fmtTime = (sec) => new Date(sec * 1000).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
export const fmtDate = (d, opts) => d.toLocaleDateString('es-ES', opts);

export function fmtDur(sec) {
  const m = Math.round(sec / 60);
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
}

export function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}
