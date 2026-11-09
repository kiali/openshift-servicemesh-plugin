import path from 'path';

// __dirname is a CommonJS global; kiali's ESM dirname helper does not apply here.

/** Shared auth state path used by auth.setup.ts and playwright.config.ts projects. */
export const AUTH_FILE = path.join(__dirname, '../../playwright/.auth/user.json');
