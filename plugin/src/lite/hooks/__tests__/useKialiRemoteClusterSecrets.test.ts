import { renderHook, waitFor } from '@testing-library/react';
import { k8sGet } from '@openshift-console/dynamic-plugin-sdk';
import { useKialiRemoteClusterSecrets } from '../useKialiRemoteClusterSecrets';
import { makeKialiResource } from '../../__fixtures__/testFactories';

const KIALI_MULTI_CLUSTER_SECRET = 'kiali-multi-cluster-secret';

describe('useKialiRemoteClusterSecrets', () => {
  afterEach(() => rstest.clearAllMocks());

  it('loads secret names from required deployment volumes and explicit CR clusters', async () => {
    rstest.mocked(k8sGet).mockImplementation(({ model }: { model: { kind?: string } }) => {
      if (model.kind === 'Deployment') {
        return Promise.resolve({
          spec: {
            template: {
              spec: {
                volumes: [
                  { name: 'cluster-a-secret', secret: { secretName: 'cluster-a-secret' } },
                  {
                    name: KIALI_MULTI_CLUSTER_SECRET,
                    secret: { optional: true, secretName: KIALI_MULTI_CLUSTER_SECRET }
                  }
                ],
                containers: [
                  {
                    name: 'kiali',
                    volumeMounts: [
                      { name: 'cluster-a-secret', mountPath: '/kiali-remote-cluster-secrets/cluster-a-secret' },
                      {
                        name: KIALI_MULTI_CLUSTER_SECRET,
                        mountPath: `/kiali-remote-cluster-secrets/${KIALI_MULTI_CLUSTER_SECRET}`
                      }
                    ]
                  }
                ]
              }
            }
          }
        });
      }
      return Promise.reject(new Error('404'));
    });

    const resource = makeKialiResource({
      spec: {
        clustering: {
          clusters: [{ name: 'east', secret_name: 'east-secret' }]
        }
      }
    });

    const { result } = renderHook(() => useKialiRemoteClusterSecrets(resource));

    await waitFor(() => {
      expect(result.current).toEqual(['cluster-a-secret', 'east-secret']);
    });
  });

  it('includes kiali-multi-cluster-secret only when named explicitly on the Kiali CR', async () => {
    rstest.mocked(k8sGet).mockResolvedValue({
      spec: {
        template: {
          spec: {
            volumes: [
              {
                name: KIALI_MULTI_CLUSTER_SECRET,
                secret: { optional: true, secretName: KIALI_MULTI_CLUSTER_SECRET }
              }
            ],
            containers: [
              {
                name: 'kiali',
                volumeMounts: [
                  {
                    name: KIALI_MULTI_CLUSTER_SECRET,
                    mountPath: `/kiali-remote-cluster-secrets/${KIALI_MULTI_CLUSTER_SECRET}`
                  }
                ]
              }
            ]
          }
        }
      }
    });

    const resource = makeKialiResource({
      spec: {
        clustering: {
          clusters: [{ name: 'hub', secret_name: KIALI_MULTI_CLUSTER_SECRET }]
        }
      }
    });

    const { result } = renderHook(() => useKialiRemoteClusterSecrets(resource));

    await waitFor(() => {
      expect(result.current).toEqual([KIALI_MULTI_CLUSTER_SECRET]);
    });
  });
});
