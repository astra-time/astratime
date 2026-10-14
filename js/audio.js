/**
 * Tonos de aviso sintetizados con la Web Audio API (OscillatorNode).
 * La aplicación no incluye ni descarga archivos de audio.
 */
let ctx = null;

/** El contexto debe crearse o reanudarse a partir de un gesto del usuario. */
export function unlock() {
  try {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  } catch { /* audio no disponible */ }
  return ctx;
}

/** Cada nota: [frecuencia (Hz), inicio (s), duración (s), onda, ganancia relativa]. */
export const SOUNDS = {
  chime: { name: 'Campanilla', notes: [[880, 0, 1.2, 'sine'], [1320, 0.18, 1.2, 'sine'], [1760, 0.36, 1.6, 'sine']] },
  bell: { name: 'Campana', notes: [[523, 0, 2.4, 'sine', 1], [1046, 0, 1.8, 'sine', 0.5], [1568, 0, 1.2, 'sine', 0.3]] },
  arp: { name: 'Arpegio suave', notes: [[523, 0, 0.5, 'triangle'], [659, 0.18, 0.5, 'triangle'], [784, 0.36, 0.5, 'triangle'], [1047, 0.54, 1, 'triangle']] },
  digital: { name: 'Digital', notes: [[880, 0, 0.14, 'square', 0.4], [880, 0.25, 0.14, 'square', 0.4], [880, 0.5, 0.14, 'square', 0.4], [1175, 0.75, 0.3, 'square', 0.4]] },
  alarm: { name: 'Alarma', notes: Array.from({ length: 8 }, (_, i) => [i % 2 ? 988 : 740, i * 0.32, 0.3, 'sawtooth', 0.4]) },
  gong: { name: 'Gong', notes: [[196, 0, 3, 'sine', 1], [392, 0, 2.4, 'sine', 0.5], [294, 0, 2, 'triangle', 0.3]] },
};

export function play(id, volume = 0.4) {
  const audio = unlock();
  if (!audio) return;
  const sound = SOUNDS[id] ?? SOUNDS.chime;
  for (const [freq, start, length, type, gain = 1] of sound.notes) {
    const osc = audio.createOscillator();
    const amp = audio.createGain();
    const t0 = audio.currentTime + start;
    osc.type = type;
    osc.frequency.value = freq;
    osc.connect(amp);
    amp.connect(audio.destination);
    amp.gain.setValueAtTime(Math.max(0.2 * gain * volume, 0.0002), t0);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + length);
    osc.start(t0);
    osc.stop(t0 + length + 0.02);
  }
}
