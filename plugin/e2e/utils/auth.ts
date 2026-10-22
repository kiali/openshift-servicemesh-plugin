import path from 'path';

/**
 * Shared auth state path used by auth.setup.ts and playwright.config.ts projects.
 *
 * Uses __dirname (not import.meta) because the plugin package is CommonJS —
 * Playwright transpiles the config and its imports to CJS, where import.meta
 * is a syntax error.
 */
export const AUTH_FILE = path.join(__dirname, '../../playwright/.auth/user.json');
