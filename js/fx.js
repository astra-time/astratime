/** Efectos visuales ambientales: lluvia de estrellas lenta, destello al completar y estrellas fugaces. */
import { on } from './bus.js';
import { $ } from './util.js';

const reduced = () => document.documentElement.dataset.motion === 'reduced';
const rand = (min, max) => min + Math.random() * (max - min);

/** Estrellas que descienden en diagonal con duraciones largas; unas son puntos y otras estelas cortas. */
function buildStars() {
  const layer = $('#stars');
  const count = Math.min(40, Math.round(innerWidth / 11));
  for (let i = 0; i < count; i++) {
    const trail = Math.random() < 0.5;
    const width = rand(1, 2.2);
    const star = document.createElement('i');
    star.style.cssText = `--x:${rand(-5, 105).toFixed(1)}%;--y:${rand(0, 100).toFixed(0)}vh;--w:${width.toFixed(1)}px;`
      + `--len:${trail ? rand(10, 26).toFixed(0) : width.toFixed(1)}px;--o:${rand(0.3, 0.85).toFixed(2)};`
      + `--d:${rand(26, 70).toFixed(0)}s;--delay:-${rand(0, 70).toFixed(0)}s`;
    layer.append(star);
  }
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
  on('phase:end', ({ ended }) => { if (ended === 'focus') burst(); });
  scheduleShootingStar();
}
