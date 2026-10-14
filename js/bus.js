/** Bus de eventos mínimo para desacoplar los módulos. */
const handlers = new Map();

export function on(event, fn) {
  if (!handlers.has(event)) handlers.set(event, []);
  handlers.get(event).push(fn);
}

export function emit(event, payload) {
  for (const fn of handlers.get(event) ?? []) fn(payload);
}
