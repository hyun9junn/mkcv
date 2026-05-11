import { GlobalRegistrator } from '@happy-dom/global-registrator';

GlobalRegistrator.register({ url: 'http://localhost' });

// Tests that assert on network behavior MUST override globalThis.fetch — this stub silently returns ok+empty for any URL.
if (typeof globalThis.fetch !== 'function') {
  globalThis.fetch = async () => ({ ok: true, json: async () => ({}) });
}
