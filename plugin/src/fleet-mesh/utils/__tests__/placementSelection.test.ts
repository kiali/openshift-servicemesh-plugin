import { aggregateDecisions, buildMembershipRows, operatorInstalledCount } from '../placementSelection';
import type { PlacementDecision } from '../../types/placement';
import { makeCluster } from '../../__fixtures__/testFactories';

describe('Placement selection', () => {
  it('aggregates all decision slices with stable sorted unique cluster names', () => {
    const decisions = [
      { status: { decisions: [{ clusterName: 'spoke' }, { clusterName: 'hub' }] } },
      { status: { decisions: [{ clusterName: 'hub' }, { clusterName: '' }] } }
    ] as PlacementDecision[];
    expect(aggregateDecisions(decisions)).toEqual({
      rawCount: 4,
      selectedNames: ['hub', 'spoke'],
      valid: false
    });
  });

  it('shows selection and mesh membership independently of operator installation', () => {
    const meshClusters = [makeCluster('hub', 'True'), makeCluster('leaving', 'False')];
    const rows = buildMembershipRows(['hub', 'joining'], meshClusters);
    expect(rows.map(row => [row.clusterName, row.membership])).toEqual([
      ['hub', 'selectedAndMesh'],
      ['joining', 'selectedOnly'],
      ['leaving', 'meshOnly']
    ]);
    expect(operatorInstalledCount(meshClusters)).toBe(1);
    expect(rows.find(row => row.clusterName === 'joining')?.clusterStatus).toBeUndefined();
  });

  it('does not infer mesh-only membership when selection cannot be read', () => {
    expect(buildMembershipRows(null, [makeCluster('hub')]).map(row => row.membership)).toEqual([
      'selectionUnavailable'
    ]);
  });
});
