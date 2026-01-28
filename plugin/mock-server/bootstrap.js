/**
 * Bootstrap for Mock Server
 *
 * Sets up browser globals before loading the bundled mock server.
 */

const PORT = process.env.MOCK_SERVER_PORT || '3001';

// Mock browser globals for Node.js environment
globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 16);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);

globalThis.window = {
  WEB_ROOT: '/',
  location: {
    pathname: '/',
    href: `http://localhost:${PORT}/`,
    origin: `http://localhost:${PORT}`,
    protocol: 'http:',
    host: `localhost:${PORT}`,
    hostname: 'localhost',
    port: PORT,
    search: '',
    hash: ''
  },
  history: {
    pushState: () => {},
    replaceState: () => {},
    go: () => {},
    back: () => {},
    forward: () => {},
    length: 1,
    state: null
  },
  localStorage: {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
    length: 0,
    key: () => null
  },
  sessionStorage: {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
    length: 0,
    key: () => null
  },
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => true,
  navigator: {
    userAgent: 'node'
  },
  matchMedia: () => ({
    matches: false,
    addListener: () => {},
    removeListener: () => {}
  }),
  getComputedStyle: () => ({}),
  requestAnimationFrame: (cb) => setTimeout(cb, 16),
  cancelAnimationFrame: (id) => clearTimeout(id)
};

globalThis.document = {
  createElement: () => ({ style: {} }),
  createElementNS: () => ({ style: {} }),
  body: {
    classList: { add: () => {}, remove: () => {} },
    appendChild: () => {},
    style: {}
  },
  head: {
    appendChild: () => {}
  },
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: () => {},
  removeEventListener: () => {},
  defaultView: globalThis.window
};

globalThis.localStorage = globalThis.window.localStorage;
globalThis.sessionStorage = globalThis.window.sessionStorage;
globalThis.navigator = globalThis.window.navigator;
globalThis.matchMedia = globalThis.window.matchMedia;
globalThis.history = globalThis.window.history;
globalThis.location = globalThis.window.location;

// Now load the bundled mock server
require('../dist/mock-server.js');
