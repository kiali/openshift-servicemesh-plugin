import type { LiteIstioResource } from '../types/istio';
import type { LiteKialiResource } from '../types/kiali';
import type { LiteOssmConsoleResource } from '../types/ossmconsole';

export const makeIstioResource = (overrides: Partial<LiteIstioResource> = {}): LiteIstioResource => ({
  apiVersion: 'sailoperator.io/v1',
  kind: 'Istio',
  metadata: { name: 'default', creationTimestamp: '2026-01-01T00:00:00Z' },
  spec: {
    namespace: 'istio-system',
    profile: 'openshift',
    updateStrategy: { type: 'InPlace' },
    version: 'v1.30.2'
  },
  status: {
    activeRevisionName: 'default',
    conditions: [{ type: 'Ready', status: 'True' }],
    state: 'Healthy'
  },
  ...overrides
});

export const makeKialiResource = (overrides: Partial<LiteKialiResource> = {}): LiteKialiResource => ({
  apiVersion: 'kiali.io/v1alpha1',
  kind: 'Kiali',
  metadata: { name: 'kiali', namespace: 'istio-system', creationTimestamp: '2026-01-01T00:00:00Z' },
  spec: {
    auth: { strategy: 'openshift' },
    deployment: { instance_name: 'kiali', namespace: 'istio-system', replicas: 1 },
    server: { port: 20001 },
    version: 'default'
  },
  status: {
    conditions: [{ type: 'Successful', status: 'True' }]
  },
  ...overrides
});

export const makeOssmConsoleResource = (overrides: Partial<LiteOssmConsoleResource> = {}): LiteOssmConsoleResource => ({
  apiVersion: 'kiali.io/v1alpha1',
  kind: 'OSSMConsole',
  metadata: { name: 'ossmconsole', namespace: 'ossmconsole', creationTimestamp: '2026-01-01T00:00:00Z' },
  spec: {
    kiali: { autoDiscover: true, serviceName: '', serviceNamespace: '', servicePort: 0 }
  },
  status: {
    kiali: { available: false }
  },
  ...overrides
});
