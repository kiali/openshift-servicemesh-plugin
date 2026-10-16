import { mergeManagedMeshStatus, worstConditions } from '../worstConditions';
import { makeEnrichedCP } from '../../__fixtures__/testFactories';

describe('worstConditions', () => {
  it('returns the worst rank among multiple planes', () => {
    const planes = [
      makeEnrichedCP({
        clusterName: 'cluster-a',
        status: { conditions: [{ type: 'Ready', status: 'True' }] }
      }),
      makeEnrichedCP({
        clusterName: 'cluster-b',
        status: { conditions: [{ type: 'Ready', status: 'False', reason: 'ReconcileError' }] }
      })
    ];

    const result = worstConditions(planes);
    expect(result.rank).toBe(3);
    expect(result.conditions).toEqual([{ type: 'Ready', status: 'False', reason: 'ReconcileError' }]);
  });

  it('returns rank 1 for empty array', () => {
    const result = worstConditions([]);
    expect(result.rank).toBe(1);
    expect(result.conditions).toBeUndefined();
  });

  it('handles all-undefined-status planes', () => {
    const planes = [
      makeEnrichedCP({ clusterName: 'cluster-a', status: undefined }),
      makeEnrichedCP({ clusterName: 'cluster-b', status: undefined })
    ];

    const result = worstConditions(planes);
    expect(result.rank).toBe(1);
    expect(result.conditions).toBeUndefined();
  });

  it('selects worst from mixed statuses', () => {
    const planes = [
      makeEnrichedCP({
        clusterName: 'cluster-a',
        status: { conditions: [{ type: 'Ready', status: 'True' }] }
      }),
      makeEnrichedCP({
        clusterName: 'cluster-b',
        status: { conditions: [{ type: 'Ready', status: 'Unknown' }] }
      }),
      makeEnrichedCP({
        clusterName: 'cluster-c',
        status: undefined
      })
    ];

    const result = worstConditions(planes);
    expect(result.rank).toBe(1);
  });

  it('returns green rank when all planes are healthy', () => {
    const planes = [
      makeEnrichedCP({
        clusterName: 'cluster-a',
        status: { conditions: [{ type: 'Ready', status: 'True' }] }
      }),
      makeEnrichedCP({
        clusterName: 'cluster-b',
        status: { conditions: [{ type: 'Ready', status: 'True' }] }
      })
    ];

    const result = worstConditions(planes);
    expect(result.rank).toBe(0);
    expect(result.conditions).toEqual([{ type: 'Ready', status: 'True' }]);
  });
});

describe('mergeManagedMeshStatus', () => {
  const mcmGreen = [{ type: 'Ready', status: 'True' }];
  const mcmRed = [{ type: 'Ready', status: 'False', reason: 'ClustersNotReady' }];

  const healthyCp = makeEnrichedCP({
    clusterName: 'cluster-a',
    status: { conditions: [{ type: 'Ready', status: 'True' }] }
  });
  const unhealthyCp = makeEnrichedCP({
    clusterName: 'cluster-b',
    status: { conditions: [{ type: 'Ready', status: 'False', reason: 'IstiodNotReady' }] }
  });

  it('keeps MCM status when no control planes are correlated', () => {
    const result = mergeManagedMeshStatus(mcmGreen, []);
    expect(result.conditions).toBe(mcmGreen);
    expect(result.rank).toBe(0);
  });

  it('degrades the mesh when only some control planes are unhealthy', () => {
    const result = mergeManagedMeshStatus(mcmGreen, [healthyCp, unhealthyCp]);
    expect(result.rank).toBe(2);
    expect(result.conditions).toEqual([
      { type: 'Ready', status: 'True' },
      {
        message: 'Some control planes are not ready',
        reason: 'SomeControlPlanesNotReady',
        status: 'False',
        type: 'ControlPlanesHealthy'
      }
    ]);
  });

  it('marks the mesh not ready when all control planes are unhealthy', () => {
    const result = mergeManagedMeshStatus(mcmGreen, [
      unhealthyCp,
      makeEnrichedCP({ clusterName: 'cluster-c', status: unhealthyCp.status })
    ]);
    expect(result.rank).toBe(3);
    expect(result.conditions).toEqual([
      {
        message: 'All control planes are not ready',
        reason: 'AllControlPlanesNotReady',
        status: 'False',
        type: 'Ready'
      }
    ]);
  });

  it('preserves MCM failures regardless of healthy control planes', () => {
    const result = mergeManagedMeshStatus(mcmRed, [healthyCp]);
    expect(result.conditions).toBe(mcmRed);
    expect(result.rank).toBe(3);
  });

  it('does not worsen a green MCM when control plane status is unknown', () => {
    const unknownCp = makeEnrichedCP({ clusterName: 'cluster-c', status: undefined });
    const result = mergeManagedMeshStatus(mcmGreen, [healthyCp, unknownCp]);
    expect(result.conditions).toBe(mcmGreen);
    expect(result.rank).toBe(0);
  });

  it('worsens an unknown MCM status when some control planes are unhealthy', () => {
    const result = mergeManagedMeshStatus(undefined, [healthyCp, unhealthyCp]);
    expect(result.rank).toBe(2);
  });
});
