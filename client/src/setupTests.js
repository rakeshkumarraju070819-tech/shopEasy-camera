import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

class MemoryStorage {
  constructor() { this.store = new Map(); }
  getItem(key) { return this.store.has(key) ? this.store.get(key) : null; }
  setItem(key, val) { this.store.set(key, String(val)); }
  removeItem(key) { this.store.delete(key); }
  clear() { this.store.clear(); }
  get length() { return this.store.size; }
  key(i) { return Array.from(this.store.keys())[i] || null; }
}

const mockLocal = new MemoryStorage();
const mockSession = new MemoryStorage();

Object.defineProperty(globalThis, 'localStorage', { value: mockLocal, configurable: true, writable: true });
Object.defineProperty(globalThis, 'sessionStorage', { value: mockSession, configurable: true, writable: true });
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage', { value: mockLocal, configurable: true, writable: true });
  Object.defineProperty(window, 'sessionStorage', { value: mockSession, configurable: true, writable: true });
}

afterEach(() => {
  cleanup();
  mockLocal.clear();
  mockSession.clear();
});

window.scrollTo = vi.fn();

// Recharts' ResponsiveContainer needs ResizeObserver, which jsdom lacks
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };

