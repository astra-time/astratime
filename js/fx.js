/** Efectos visuales ambientales: lluvia de estrellas lenta, destello al completar y estrellas fugaces. */
import { on } from './bus.js';
import { $, clamp, debounce } from './util.js';

const reduced = () => document.documentElement.dataset.motion === 'reduced';
const rand = (min, max) => min + Math.random() * (max - min);

/**
 * Estrellas que descienden en diagonal. Tamaño, longitud de la estela y cantidad se escalan con la
 * anchura de la ventana para que también se aprecien en pantallas grandes.
 */
function buildStars() {
  const layer = $('#stars');
  layer.replaceChildren();
  const scale = clamp(innerWidth / 800, 1, 1.9);
  const count = Math.min(90, Math.round(innerWidth / 12));
  for (let i = 0; i < count; i++) {
    const trail = Math.random() < 0.55;
    const width = rand(1.3, 2.4) * scale;
    const star = document.createElement('i');
    if (Math.random() < 0.18) star.className = 'g';
    star.style.cssText = `--x:${rand(-5, 105).toFixed(1)}%;--y:${rand(0, 100).toFixed(0)}vh;--w:${width.toFixed(1)}px;`
      + `--len:${(trail ? rand(16, 36) * scale : width).toFixed(0)}px;--o:${rand(0.4, 1).toFixed(2)};`
      + `--d:${rand(16, 42).toFixed(0)}s;--delay:-${rand(0, 42).toFixed(0)}s`;
    layer.append(star);
  }
}

/** Resplandor suave del color del tema que sigue al puntero (solo ratón). */
function initGlow() {
  const glow = $('#glow');
  let x = 0;
  let y = 0;
  let queued = false;
  addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    x = e.clientX;
    y = e.clientY;
    glow.classList.add('on');
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; glow.style.transform = `translate(${x}px, ${y}px)`; });
  });
  document.documentElement.addEventListener('mouseleave', () => glow.classList.remove('on'));
}

/** Añade `total` partículas que se dispersan radialmente desde el centro del contenedor. */
function scatter(box, total, minReach, maxReach) {
  for (let i = 0; i < total; i++) {
    const angle = (i / total) * Math.PI * 2 + rand(-0.1, 0.1);
    const reach = rand(minReach, maxReach);
    const particle = document.createElement('i');
    if (i % 2) particle.className = 's';
    particle.style.setProperty('--dx', `${Math.cos(angle) * reach}px`);
    particle.style.setProperty('--dy', `${Math.sin(angle) * reach}px`);
    box.append(particle);
  }
}

/** Destello al desbloquear un hito, sobre el aviso en pantalla. */
export function celebrate() {
  if (reduced()) return;
  const box = document.createElement('div');
  box.className = 'burst fixed';
  scatter(box, 24, 70, 130);
  document.body.append(box);
  setTimeout(() => box.remove(), 1500);
}

/** Partículas y onda expansiva desde el círculo al completarse una sesión de enfoque. */
function burst() {
  if (reduced()) return;
  const ring = $('#ring');
  const box = document.createElement('div');
  box.className = 'burst';
  box.append(Object.assign(document.createElement('span'), { className: 'shock' }));
  scatter(box, 30, 95, 170);
  ring.append(box);
  ring.classList.remove('flash');
  void ring.offsetWidth;
  ring.classList.add('flash');
  setTimeout(() => { box.remove(); ring.classList.remove('flash'); }, 1500);
}

/** Estrella fugaz ocasional. */
function scheduleShootingStar() {
  setTimeout(() => {
    const el = $('#shoot');
    if (!reduced() && document.visibilityState === 'visible') {
      el.style.left = `${rand(5, 50).toFixed(0)}%`;
      el.style.top = `${rand(6, 32).toFixed(0)}%`;
      el.classList.remove('go');
      void el.offsetWidth;
      el.classList.add('go');
    }
    scheduleShootingStar();
  }, rand(25000, 60000));
}

export function initFx() {
  buildStars();
  initGlow();
  addEventListener('resize', debounce(buildStars, 250));
  on('phase:end', ({ ended }) => { if (ended === 'focus') burst(); });
  scheduleShootingStar();
}
