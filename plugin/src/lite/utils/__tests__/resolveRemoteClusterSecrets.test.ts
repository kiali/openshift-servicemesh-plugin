import {
  resolveRemoteClusterSecretNames,
  extractRemoteClusterSecretNamesFromDeployment
} from '../resolveRemoteClusterSecrets';
import type { KialiDeploymentLike } from '../kialiDeployment';
import { makeKialiResource } from '../../__fixtures__/testFactories';

const KIALI_MULTI_CLUSTER_SECRET = 'kiali-multi-cluster-secret';

const makeDeploymentWithRemoteSecrets = (
  secretNames: string[],
  options?: { includeOptionalFixedSecret?: boolean }
): KialiDeploymentLike => {
  const volumes = secretNames.map(secretName => ({
    name: secretName,
    secret: { secretName }
  }));

  if (options?.includeOptionalFixedSecret) {
    volumes.push({
      name: KIALI_MULTI_CLUSTER_SECRET,
      secret: { optional: true, secretName: KIALI_MULTI_CLUSTER_SECRET }
    });
  }

  return {
    spec: {
      template: {
        spec: {
          volumes,
          containers: [
            {
              name: 'kiali',
              volumeMounts: [
                ...secretNames.map(secretName => ({
                  name: secretName,
                  mountPath: `/kiali-remote-cluster-secrets/${secretName}`
                })),
                ...(options?.includeOptionalFixedSecret
                  ? [
                      {
                        name: KIALI_MULTI_CLUSTER_SECRET,
                        mountPath: `/kiali-remote-cluster-secrets/${KIALI_MULTI_CLUSTER_SECRET}`
                      }
                    ]
                  : [])
              ]
            }
          ]
        }
      }
    }
  };
};

describe('extractRemoteClusterSecretNamesFromDeployment', () => {
  it('reads required remote-cluster secret volumes', () => {
    const deployment = makeDeploymentWithRemoteSecrets(['cluster-a-secret']);
    expect(extractRemoteClusterSecretNamesFromDeployment(deployment)).toEqual(['cluster-a-secret']);
  });

  it('ignores the optional kiali-multi-cluster-secret volume slot', () => {
    const deployment = makeDeploymentWithRemoteSecrets(['cluster-a-secret'], { includeOptionalFixedSecret: true });
    expect(extractRemoteClusterSecretNamesFromDeployment(deployment)).toEqual(['cluster-a-secret']);
  });

  it('ignores non-remote-cluster volume mounts', () => {
    const deployment: KialiDeploymentLike = {
      spec: {
        template: {
          spec: {
            volumes: [{ name: 'east-secret', secret: { secretName: 'east-secret' } }],
            containers: [
              {
                name: 'kiali',
                volumeMounts: [
                  { mountPath: '/kiali-secret' },
                  { name: 'east-secret', mountPath: '/kiali-remote-cluster-secrets/east-secret' }
                ]
              }
            ]
          }
        }
      }
    };
    expect(extractRemoteClusterSecretNamesFromDeployment(deployment)).toEqual(['east-secret']);
  });
});

describe('resolveRemoteClusterSecretNames', () => {
  it('includes required remote-cluster secrets mounted on the deployment', () => {
    const names = resolveRemoteClusterSecretNames(
      makeKialiResource(),
      makeDeploymentWithRemoteSecrets(['cluster-b-secret'])
    );
    expect(names).toEqual(['cluster-b-secret']);
  });

  it('omits the optional kiali-multi-cluster-secret mount when it is the only remote volume', () => {
    const names = resolveRemoteClusterSecretNames(
      makeKialiResource(),
      makeDeploymentWithRemoteSecrets([], { includeOptionalFixedSecret: true })
    );
    expect(names).toEqual([]);
  });

  it('returns only explicit cluster secret names when deployment is unavailable', () => {
    const resource = makeKialiResource({
      spec: {
        clustering: {
          clusters: [
            { name: 'east', secret_name: 'east-secret' },
            { name: 'west', secret_name: 'west-secret' }
          ]
        }
      }
    });

    expect(resolveRemoteClusterSecretNames(resource, undefined)).toEqual(['east-secret', 'west-secret']);
  });

  it('merges explicit and mounted secret names', () => {
    const resource = makeKialiResource({
      spec: {
        clustering: {
          clusters: [{ name: 'east', secret_name: 'east-secret' }]
        }
      }
    });

    const names = resolveRemoteClusterSecretNames(
      resource,
      makeDeploymentWithRemoteSecrets(['cluster-b-secret'], { includeOptionalFixedSecret: true })
    );
    expect(names).toEqual(['cluster-b-secret', 'east-secret']);
  });

  it('includes kiali-multi-cluster-secret when named explicitly on the Kiali CR', () => {
    const resource = makeKialiResource({
      spec: {
        clustering: {
          clusters: [{ name: 'hub', secret_name: KIALI_MULTI_CLUSTER_SECRET }]
        }
      }
    });

    expect(resolveRemoteClusterSecretNames(resource, undefined)).toEqual([KIALI_MULTI_CLUSTER_SECRET]);
  });

  it('dedupes secrets across sources', () => {
    const resource = makeKialiResource({
      spec: {
        clustering: {
          clusters: [{ name: 'east', secret_name: 'shared-secret' }]
        }
      }
    });

    const names = resolveRemoteClusterSecretNames(resource, makeDeploymentWithRemoteSecrets(['shared-secret']));
    expect(names).toEqual(['shared-secret']);
  });
});
