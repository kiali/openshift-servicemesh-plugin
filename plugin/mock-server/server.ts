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

import express, { Request, Response } from 'express';
import { handlers } from '../src/kiali/mocks/handlers';

/**
 * MSW handler info structure (internal MSW types are not exported)
 */
interface MswHandlerInfo {
  method: string;
  path: string;
}

interface MswHandler {
  info?: MswHandlerInfo;
  resolver?: (args: { request: globalThis.Request; params: Record<string, string>; cookies: Record<string, string> }) => Promise<globalThis.Response | object | string | null>;
}

type HttpMethod = 'get' | 'post' | 'put' | 'delete' | 'patch';

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
    const mswHandler = handler as unknown as MswHandler;
    const info = mswHandler.info;
    if (!info?.method || !info?.path) continue;

    const method = info.method.toLowerCase() as HttpMethod;
    let routePath: string = info.path;

    // Convert MSW path pattern to Express
    if (routePath.startsWith('*')) {
      routePath = routePath.substring(1);
    }
    if (!routePath.startsWith('/')) {
      routePath = '/' + routePath;
    }

    // Skip catch-all patterns
    if (routePath === '/' || routePath === '/*') continue;

    const routeHandler = async (req: Request, res: Response): Promise<void> => {
      try {
        const protocol = req.protocol;
        const host = req.get('host') || `localhost:${PORT}`;
        const fullUrl = `${protocol}://${host}${req.originalUrl}`;

        const mswRequest = new globalThis.Request(fullUrl, {
          method: req.method,
          headers: new Headers(req.headers as Record<string, string>),
          body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body)
        });

        const resolver = mswHandler.resolver;
        if (!resolver) {
          res.status(500).json({ error: 'No resolver for handler' });
          return;
        }

        const result = await resolver({
          request: mswRequest,
          params: req.params as Record<string, string>,
          cookies: (req.cookies || {}) as Record<string, string>
        });

        if (result instanceof globalThis.Response) {
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

    const registerRoute = app[method].bind(app);
    if (registerRoute) {
      console.log(`  ${method.toUpperCase().padEnd(6)} ${routePath}`);
      registerRoute(routePath, routeHandler);
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
