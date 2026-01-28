/**
 * Mock Kiali Backend Server
 *
 * This server provides mock API responses for OSSMC plugin development
 * without requiring a real Kiali backend.
 *
 * Usage:
 *   Terminal 1: yarn mock-server
 *   Terminal 2: yarn start
 *   Terminal 3: yarn start-console
 *
 * The mock server runs on port 3001 by default (configurable via MOCK_SERVER_PORT).
 * Set API_PROXY=http://localhost:<port> in .env.development
 *
 * Note: Browser globals are set up in bootstrap.js
 */

import express from 'express';
import { handlers } from '../src/kiali/mocks/handlers';

const app = express();
const PORT = parseInt(process.env.MOCK_SERVER_PORT || '3001', 10);

// Enable CORS
app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  next();
});

// Handle preflight
app.options('*', (_req, res) => {
  res.sendStatus(204);
});

// Parse JSON bodies
app.use(express.json());

// Logging middleware
app.use((req, _res, next) => {
  console.log(`[Mock Server] ${req.method} ${req.path}`);
  next();
});

/**
 * Register MSW handlers as Express routes
 */
const registerHandlers = (): void => {
  for (const handler of handlers) {
    const info = (handler as any).info;
    if (!info?.method || !info?.path) continue;

    const method = info.method.toLowerCase() as 'get' | 'post' | 'put' | 'delete' | 'patch';
    let path: string = info.path;

    // Convert MSW path pattern to Express
    if (path.startsWith('*')) {
      path = path.substring(1);
    }
    if (!path.startsWith('/')) {
      path = '/' + path;
    }

    // Skip catch-all patterns
    if (path === '/' || path === '/*') continue;

    const routeHandler = async (req: any, res: any): Promise<void> => {
      try {
        const protocol = req.protocol;
        const host = req.get('host') || `localhost:${PORT}`;
        const fullUrl = `${protocol}://${host}${req.originalUrl}`;

        const mswRequest = new globalThis.Request(fullUrl, {
          method: req.method,
          headers: new Headers(req.headers as Record<string, string>),
          body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body)
        });

        const resolver = (handler as any).resolver;
        if (!resolver) {
          res.status(500).json({ error: 'No resolver for handler' });
          return;
        }

        const result = await resolver({
          request: mswRequest,
          params: req.params,
          cookies: req.cookies || {}
        });

        if (result instanceof Response) {
          const body = await result.text();
          res.status(result.status);
          result.headers.forEach((value: string, key: string) => {
            if (key.toLowerCase() !== 'content-encoding') {
              res.setHeader(key, value);
            }
          });
          res.send(body);
          return;
        }

        if (result && typeof result === 'object') {
          res.json(result);
          return;
        }

        res.status(200).send(result || '');
      } catch (error) {
        console.error(`[Mock Server] Error:`, error);
        res.status(500).json({ error: 'Handler error', message: String(error) });
      }
    };

    if ((app as any)[method]) {
      console.log(`  ${method.toUpperCase().padEnd(6)} ${path}`);
      (app as any)[method](path, routeHandler);
    }
  }
};

console.log('[Mock Server] Registering handlers:');
registerHandlers();

// WebSocket endpoint stub (WebSocket not supported in mock server)
app.get('/ws', (_req, res) => {
  res.status(200).send('WebSocket endpoint - not supported in mock server');
});

// Catch-all for unhandled routes
app.use((req, res) => {
  console.warn(`[Mock Server] No handler for: ${req.method} ${req.path}`);
  res.status(404).json({
    error: 'Not Found',
    path: req.path,
    hint: 'Add a handler in src/kiali/mocks/handlers/'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`[Mock Server] Running at http://localhost:${PORT}`);
});
