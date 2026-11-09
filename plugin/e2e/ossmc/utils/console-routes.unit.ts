import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { afterEach, test } from 'node:test';
import { request, type Page } from '@playwright/test';

import { kialiUrl } from '../../utils/kialiUrl';
import { gotoConsolePage } from '../../utils/navigation';
import { toOssmcConsolePath } from './console-routes';

const originalEnv = {
  PLAYWRIGHT_BASE_URL: process.env.PLAYWRIGHT_BASE_URL,
  PLAYWRIGHT_OSSMC: process.env.PLAYWRIGHT_OSSMC
};

afterEach(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

for (const page of ['overview', 'mesh', 'namespaces', 'applications', 'services', 'workloads', 'istio']) {
  test(`maps the ${page} list route`, () => {
    assert.equal(toOssmcConsolePath(`/console/${page}?refresh=0`), `/ossmconsole/${page}?refresh=0`);
  });
}

const detailRoutes = [
  ['/console/graph', '/ossmconsole/graph'],
  ['/console/graph/namespaces', '/ossmconsole/graph'],
  [
    '/console/graph/node/namespaces/bookinfo/workloads/reviews-v1',
    '/ossmconsole/graph/ns/bookinfo/workloads/reviews-v1'
  ],
  ['/console/namespaces/bookinfo', '/k8s/cluster/projects/bookinfo/ossmconsole'],
  ['/console/namespaces/bookinfo/applications/reviews', '/ossmconsole/applications/bookinfo/reviews'],
  ['/console/namespaces/bookinfo/workloads/reviews-v1', '/k8s/ns/bookinfo/deployments/reviews-v1/ossmconsole'],
  ['/console/namespaces/bookinfo/services/reviews', '/k8s/ns/bookinfo/services/reviews/ossmconsole'],
  ['/console/namespaces/bookinfo/pods/reviews-v1-123', '/k8s/ns/bookinfo/pods/reviews-v1-123/ossmconsole'],
  [
    '/console/namespaces/bookinfo/istio/networking.istio.io/v1/VirtualService/reviews',
    '/k8s/ns/bookinfo/networking.istio.io~v1~VirtualService/reviews/ossmconsole'
  ],
  [
    '/console/istio/new/networking.istio.io/v1/VirtualService',
    '/ossmconsole/istio/new/networking.istio.io/v1/VirtualService'
  ]
];

for (const [input, expected] of detailRoutes) {
  test(`maps ${input} while preserving query and fragment`, () => {
    const suffix = '?refresh=0&clusterName=east&namespaces=bookinfo%2Calpha#traffic';
    assert.equal(toOssmcConsolePath(input + suffix), expected + suffix);
  });
}

test('maps workload kinds and removes the routing-only type parameter', () => {
  assert.equal(
    toOssmcConsolePath('/console/namespaces/bookinfo/workloads/reviews?type=StatefulSet&clusterName=east#logs'),
    '/k8s/ns/bookinfo/statefulsets/reviews/ossmconsole?clusterName=east#logs'
  );
});

test('keeps external services on the plugin detail page', () => {
  assert.equal(
    toOssmcConsolePath('/console/namespaces/bookinfo/services/external?type=External&clusterName=east'),
    '/ossmconsole/services/bookinfo/external?type=External&clusterName=east'
  );
  assert.equal(
    toOssmcConsolePath('/console/namespaces/bookinfo/services/host.example.com'),
    '/ossmconsole/services/bookinfo/host.example.com'
  );
});

test('maps namespace-scoped resource lists without dropping existing parameters', () => {
  assert.equal(
    toOssmcConsolePath('/console/namespaces/bookinfo/workloads?clusterName=east#list'),
    '/ossmconsole/workloads?clusterName=east&namespaces=bookinfo#list'
  );
});

test('rejects incomplete Istio detail paths', () => {
  assert.throws(
    () => toOssmcConsolePath('/console/namespaces/bookinfo/istio/networking.istio.io/v1/VirtualService'),
    /Invalid Istio detail route/
  );
});

test('browser route translation leaves Console-native and API paths untouched', () => {
  for (const path of ['/ossmconsole/overview', '/k8s/cluster/projects/bookinfo/ossmconsole', '/api/config', '/']) {
    assert.equal(toOssmcConsolePath(path), path);
  }
});

test('uses the Console default origin in OSSMC mode', () => {
  process.env.PLAYWRIGHT_OSSMC = 'true';
  delete process.env.PLAYWRIGHT_BASE_URL;
  assert.equal(kialiUrl('/console/overview'), 'http://localhost:9000/ossmconsole/overview');
});

test('preserves standalone Kiali paths and web roots outside OSSMC mode', () => {
  process.env.PLAYWRIGHT_OSSMC = 'false';
  process.env.PLAYWRIGHT_BASE_URL = 'https://kiali.example/kiali/';
  assert.equal(kialiUrl('/console/overview?refresh=0'), 'https://kiali.example/kiali/console/overview?refresh=0');
});

test('adapts direct graph navigation through the shared URL helper', () => {
  process.env.PLAYWRIGHT_OSSMC = 'true';
  process.env.PLAYWRIGHT_BASE_URL = 'https://console.example/';
  assert.equal(kialiUrl('/console/graph/namespaces?refresh=0'), 'https://console.example/ossmconsole/graph?refresh=0');
});

test('adapts the vendored gotoConsolePage entry point', async () => {
  process.env.PLAYWRIGHT_OSSMC = 'true';
  process.env.PLAYWRIGHT_BASE_URL = 'https://console.example';
  let destination = '';
  const page = {
    goto: async (url: string): Promise<void> => {
      destination = url;
    }
  } as unknown as Page;
  await gotoConsolePage(page, 'namespaces/bookinfo/services/reviews', { tab: 'traffic' }, { waitForLoad: false });
  assert.equal(
    destination,
    'https://console.example/k8s/ns/bookinfo/services/reviews/ossmconsole?refresh=0&tab=traffic'
  );
});

const apiPaths = [
  ['/api', '/api'],
  ['/api/', '/api/'],
  ['/api?ready=true', '/api?ready=true'],
  ['/api/config', '/api/config'],
  ['api/config', '/api/config'],
  [
    '/api/namespaces?namespaces=bookinfo%2Calpha&clusterName=east',
    '/api/namespaces?namespaces=bookinfo%2Calpha&clusterName=east'
  ],
  [
    '/api/namespaces/bookinfo/workloads/reviews-v1?health=true',
    '/api/namespaces/bookinfo/workloads/reviews-v1?health=true'
  ]
];

for (const [input, expected] of apiPaths) {
  test(`routes ${input} through the Console Kiali proxy`, () => {
    process.env.PLAYWRIGHT_OSSMC = 'true';
    process.env.PLAYWRIGHT_BASE_URL = 'https://console.example/';
    assert.equal(kialiUrl(input), `https://console.example/api/proxy/plugin/ossmconsole/kiali${expected}`);
  });
}

test('does not add a second proxy prefix or rewrite non-API paths', () => {
  process.env.PLAYWRIGHT_OSSMC = 'true';
  process.env.PLAYWRIGHT_BASE_URL = 'https://console.example';
  for (const path of [
    '/api/proxy/plugin/ossmconsole/kiali/api/config?clusterName=east',
    '/api/proxy/plugin/another-plugin/backend/api/config',
    '/ossmconsole/overview',
    '/k8s/cluster/projects/bookinfo/ossmconsole',
    '/apiculture'
  ]) {
    assert.equal(kialiUrl(path), `https://console.example${path}`);
  }
});

test('preserves standalone Kiali API URLs and web roots', () => {
  process.env.PLAYWRIGHT_OSSMC = 'false';
  process.env.PLAYWRIGHT_BASE_URL = 'https://kiali.example/kiali/';
  assert.equal(kialiUrl('/api/config?clusterName=east'), 'https://kiali.example/kiali/api/config?clusterName=east');
});

test('direct Playwright API requests reach the proxied endpoint', async () => {
  let requestedUrl = '';
  const server = createServer((req, res) => {
    requestedUrl = req.url ?? '';
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ambientEnabled: true }));
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    process.env.PLAYWRIGHT_OSSMC = 'true';
    process.env.PLAYWRIGHT_BASE_URL = `http://127.0.0.1:${address.port}`;
    const context = await request.newContext();
    try {
      const response = await context.get(kialiUrl('/api/config?clusterName=east'));
      assert.equal(response.status(), 200);
      assert.deepEqual(await response.json(), { ambientEnabled: true });
      assert.equal(requestedUrl, '/api/proxy/plugin/ossmconsole/kiali/api/config?clusterName=east');
    } finally {
      await context.dispose();
    }
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
  }
});
