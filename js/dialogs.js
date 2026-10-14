/** Diálogos modales (<dialog>), popovers anclados y avisos. */
import { $, clamp } from './util.js';

/** Cierra el diálogo al pulsar sobre el fondo. */
export function enhanceDialog(dlg) {
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close('cancel'); });
}

export function confirmDialog({ title, text, ok = 'Confirmar' }) {
  const dlg = $('#dlg-confirm');
  $('#dc-title').textContent = title;
  $('#dc-text').textContent = text;
  $('#dc-ok').textContent = ok;
  return new Promise((resolve) => {
    dlg.addEventListener('close', () => resolve(dlg.returnValue === 'ok'), { once: true });
    dlg.showModal();
  });
}

let toastTimer;
export function toast(message, ms = 4500) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

/** Texto anunciado por lectores de pantalla sin mostrarse en la interfaz. */
export function announce(message) {
  $('#live').textContent = '';
  requestAnimationFrame(() => { $('#live').textContent = message; });
}

/**
 * Popover anclado a un botón. El contenedor `pop` actúa como fondo transparente
 * que cierra el panel al pulsar fuera de él o con Escape.
 */
export function bindPopover(button, pop, onOpen) {
  const panel = pop.firstElementChild;
  const close = () => {
    pop.hidden = true;
    button.setAttribute('aria-expanded', 'false');
  };
  const open = () => {
    onOpen?.();
    pop.hidden = false;
    const r = button.getBoundingClientRect();
    const w = panel.offsetWidth;
    const hgt = panel.offsetHeight;
    panel.style.left = `${clamp(r.right - w, 8, innerWidth - w - 8)}px`;
    const below = r.bottom + 8;
    panel.style.top = `${below + hgt > innerHeight - 8 ? Math.max(8, r.top - hgt - 8) : below}px`;
    button.setAttribute('aria-expanded', 'true');
    panel.querySelector('button, input, select')?.focus();
  };
  button.addEventListener('click', () => (pop.hidden ? open() : close()));
  pop.addEventListener('click', (e) => { if (e.target === pop) { close(); button.focus(); } });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !pop.hidden) { close(); button.focus(); }
  });
  return { open, close };
}
