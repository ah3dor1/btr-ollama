import type { BtrBridge } from '../types';

/**
 * The preload bridge. In a normal Electron session this always exists; the
 * fallback keeps the app from crashing (and explains itself) if the renderer is
 * opened outside of Electron during development.
 */
export const bridge: BtrBridge =
  window.btr ??
  (new Proxy({} as BtrBridge, {
    get() {
      return async () => {
        throw new Error('BTR-Ollama must run inside the desktop app (npm start).');
      };
    },
  }) as BtrBridge);

export const isDesktop = Boolean(window.btr);
