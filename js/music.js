/** Ventana flotante con reproductor embebido de YouTube / YouTube Music. */
import { load, save } from './storage.js';
import { $ } from './util.js';
import { icon } from './icons.js';

const EMBED = 'https://www.youtube-nocookie.com/embed/';
const ID = /^[\w-]{6,}$/;

/**
 * Obtiene la URL de incrustación a partir de un enlace de vídeo o lista.
 * Admite youtube.com, youtu.be y music.youtube.com. Devuelve null si no es válido.
 */
export function parseYouTube(input) {
  let url;
  try { url = new URL(String(input).trim()); } catch { return null; }
  const host = url.hostname.replace(/^(www|m)\./, '');
  const parts = url.pathname.split('/').filter(Boolean);
  let video = null;
  if (host === 'youtu.be') video = parts[0];
  else if (['youtube.com', 'music.youtube.com', 'youtube-nocookie.com'].includes(host)) {
    if (url.pathname === '/watch') video = url.searchParams.get('v');
    else if (['embed', 'shorts', 'live'].includes(parts[0])) video = parts[1];
  } else return null;
  const list = url.searchParams.get('list');
  if (video && !ID.test(video)) video = null;
  if (list && !ID.test(list)) return null;
  if (video && list) return `${EMBED}${video}?list=${list}`;
  if (video) return `${EMBED}${video}`;
  if (list) return `${EMBED}videoseries?list=${list}`;
  return null;
}

function load_(src) {
  const frame = $('#yt-frame');
  frame.replaceChildren();
  if (!src) return;
  const iframe = document.createElement('iframe');
  iframe.src = src;
  iframe.title = 'Reproductor de YouTube';
  iframe.allow = 'autoplay; encrypted-media; picture-in-picture';
  iframe.referrerPolicy = 'strict-origin-when-cross-origin';
  iframe.setAttribute('allowfullscreen', '');
  frame.append(iframe);
}

export function initMusic() {
  const win = $('#yt');
  const button = $('#btn-music');
  const input = $('#yt-url');
  const msg = $('#yt-msg');
  $('#yt-min').innerHTML = icon('minus', 16);
  $('#yt-close').innerHTML = icon('x', 16);

  const open = () => {
    win.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    const saved = load('yt', '');
    input.value = saved;
    if (saved && !$('#yt-frame iframe')) load_(parseYouTube(saved));
  };
  const close = () => {
    win.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    load_(null); // al cerrar se detiene la reproducción
  };

  button.addEventListener('click', () => (win.hidden ? open() : close()));
  $('#yt-close').addEventListener('click', () => { close(); button.focus(); });
  $('#yt-min').addEventListener('click', () => {
    const min = win.classList.toggle('min');
    $('#yt-min').setAttribute('aria-label', min ? 'Expandir reproductor' : 'Minimizar reproductor');
  });
  $('#yt-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const src = parseYouTube(input.value);
    if (!src) { msg.textContent = 'Enlace no válido. Usa una URL de vídeo o lista de YouTube o YouTube Music.'; return; }
    msg.textContent = '';
    save('yt', input.value.trim());
    load_(src);
  });
}
