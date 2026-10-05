import { renderHook } from '@testing-library/react';
import { useK8sWatchResource } from '@openshift-console/dynamic-plugin-sdk';
import { useMeshPlacement } from '../useMeshPlacement';
import type { Placement, PlacementDecision } from '../../types/placement';

const makePlacement = (selected: number): Placement => ({
  apiVersion: 'cluster.open-cluster-management.io/v1beta1',
  kind: 'Placement',
  metadata: { name: 'demo-placement', namespace: 'mesh-ns' },
  status: {
    numberOfSelectedClusters: selected,
    conditions: [{ type: 'PlacementSatisfied', status: 'True' }]
  }
});

const makeDecision = (names: string[]): PlacementDecision => ({
  apiVersion: 'cluster.open-cluster-management.io/v1beta1',
  kind: 'PlacementDecision',
  metadata: { name: 'slice-1', namespace: 'mesh-ns' },
  status: { decisions: names.map(clusterName => ({ clusterName })) }
});

afterEach(() => rstest.resetAllMocks());

describe('useMeshPlacement', () => {
  it('watches the same-namespace Placement and labeled decision slices', () => {
    rstest
      .mocked(useK8sWatchResource)
      .mockReturnValueOnce([makePlacement(2), true, null])
      .mockReturnValueOnce([[makeDecision(['hub']), makeDecision(['spoke'])], true, null]);
    const { result } = renderHook(() => useMeshPlacement('mesh-ns', 'demo-placement'));
    expect(result.current.state).toBe('ready');
    expect(result.current.selectedNames).toEqual(['hub', 'spoke']);
    expect(useK8sWatchResource).toHaveBeenNthCalledWith(1, {
      groupVersionKind: { group: 'cluster.open-cluster-management.io', kind: 'Placement', version: 'v1beta1' },
      name: 'demo-placement',
      namespace: 'mesh-ns'
    });
    expect(useK8sWatchResource).toHaveBeenNthCalledWith(2, {
      groupVersionKind: { group: 'cluster.open-cluster-management.io', kind: 'PlacementDecision', version: 'v1beta1' },
      isList: true,
      namespace: 'mesh-ns',
      selector: { matchLabels: { 'cluster.open-cluster-management.io/placement': 'demo-placement' } }
    });
  });

  it('treats partial decision updates as updating instead of an empty selection', () => {
    rstest
      .mocked(useK8sWatchResource)
      .mockReturnValueOnce([makePlacement(2), true, null])
      .mockReturnValueOnce([[makeDecision(['hub'])], true, null]);
    const { result } = renderHook(() => useMeshPlacement('mesh-ns', 'demo-placement'));
    expect(result.current.state).toBe('updating');
    expect(result.current.selectedNames).toBeNull();
  });

  it('keeps selection unknown when decisions are forbidden', () => {
    rstest
      .mocked(useK8sWatchResource)
      .mockReturnValueOnce([makePlacement(1), true, null])
      .mockReturnValueOnce([null, true, { code: 403 }]);
    const { result } = renderHook(() => useMeshPlacement('mesh-ns', 'demo-placement'));
    expect(result.current.state).toBe('forbidden');
    expect(result.current.selectedNames).toBeNull();
  });

  it('distinguishes a missing Placement from an empty selection', () => {
    rstest
      .mocked(useK8sWatchResource)
      .mockReturnValueOnce([null, true, { code: 404 }])
      .mockReturnValueOnce([[], true, null]);
    const { result } = renderHook(() => useMeshPlacement('mesh-ns', 'demo-placement'));
    expect(result.current.state).toBe('missing');
    expect(result.current.selectedNames).toBeNull();
  });

  it('treats a settled zero-decision Placement as a known empty selection', () => {
    rstest
      .mocked(useK8sWatchResource)
      .mockReturnValueOnce([makePlacement(0), true, null])
      .mockReturnValueOnce([[], true, null]);
    const { result } = renderHook(() => useMeshPlacement('mesh-ns', 'demo-placement'));
    expect(result.current.state).toBe('ready');
    expect(result.current.selectedNames).toEqual([]);
  });

  it('does not watch selection resources without a placement reference', () => {
    rstest.mocked(useK8sWatchResource).mockReturnValue([null, false, null]);
    const { result } = renderHook(() => useMeshPlacement('mesh-ns', undefined));
    expect(result.current.state).toBe('missingReference');
    expect(useK8sWatchResource).toHaveBeenNthCalledWith(1, null);
    expect(useK8sWatchResource).toHaveBeenNthCalledWith(2, null);
  });

  it('does not start an unscoped decision watch without a namespace', () => {
    rstest.mocked(useK8sWatchResource).mockReturnValue([null, true, null]);
    const { result } = renderHook(() => useMeshPlacement('', 'demo-placement'));
    expect(result.current.selectedNames).toBeNull();
    expect(useK8sWatchResource).toHaveBeenNthCalledWith(1, null);
    expect(useK8sWatchResource).toHaveBeenNthCalledWith(2, null);
  });

  it.each([
    { watch: 'placement', error: { code: 403 }, state: 'forbidden' },
    { watch: 'placement', error: { response: { status: 503 } }, state: 'error' },
    { watch: 'decision', error: { statusCode: 403 }, state: 'forbidden' },
    { watch: 'decision', error: { code: 404 }, state: 'error' },
    { watch: 'decision', error: new Error('Connection lost'), state: 'error' }
  ])('keeps selection unknown after a $watch read failure: $state', ({ watch, error, state }) => {
    rstest
      .mocked(useK8sWatchResource)
      .mockReturnValueOnce([makePlacement(1), watch !== 'placement', watch === 'placement' ? error : null])
      .mockReturnValueOnce([[makeDecision(['hub'])], watch !== 'decision', watch === 'decision' ? error : null]);
    const { result } = renderHook(() => useMeshPlacement('mesh-ns', 'demo-placement'));
    expect(result.current.state).toBe(state);
    expect(result.current.selectedNames).toBeNull();
  });

  it.each(['placement', 'decision'])('keeps selection unknown while the %s watch is pending', watch => {
    rstest
      .mocked(useK8sWatchResource)
      .mockReturnValueOnce([makePlacement(1), watch !== 'placement', null])
      .mockReturnValueOnce([[makeDecision(['hub'])], watch !== 'decision', null]);
    const { result } = renderHook(() => useMeshPlacement('mesh-ns', 'demo-placement'));
    expect(result.current.state).toBe('loading');
    expect(result.current.selectedNames).toBeNull();
  });

  it('waits for the first decisions when the Placement has no status yet', () => {
    rstest
      .mocked(useK8sWatchResource)
      .mockReturnValueOnce([{ ...makePlacement(0), status: undefined }, true, null])
      .mockReturnValueOnce([[], true, null]);
    const { result } = renderHook(() => useMeshPlacement('mesh-ns', 'demo-placement'));
    expect(result.current.state).toBe('waiting');
    expect(result.current.selectedNames).toBeNull();
  });

  it('waits for current Placement conditions after a policy update even if the counts match', () => {
    const placement = makePlacement(1);
    placement.metadata!.generation = 2;
    placement.status!.conditions![0].observedGeneration = 1;
    rstest
      .mocked(useK8sWatchResource)
      .mockReturnValueOnce([placement, true, null])
      .mockReturnValueOnce([[makeDecision(['hub'])], true, null]);
    const { result, rerender } = renderHook(() => useMeshPlacement('mesh-ns', 'demo-placement'));
    expect(result.current.state).toBe('updating');
    expect(result.current.selectedNames).toBeNull();

    const current = {
      ...placement,
      status: {
        ...placement.status,
        conditions: [{ type: 'PlacementSatisfied', status: 'True' as const, observedGeneration: 2 }]
      }
    };
    rstest
      .mocked(useK8sWatchResource)
      .mockReturnValueOnce([current, true, null])
      .mockReturnValueOnce([[makeDecision(['spoke'])], true, null]);
    rerender();
    expect(result.current.selectedNames).toEqual(['spoke']);
  });

  it.each([
    ['mesh-ns', 'other-placement'],
    ['other-ns', 'demo-placement']
  ])('switches to %s/%s without retaining old selection', (namespace, name) => {
    rstest
      .mocked(useK8sWatchResource)
      .mockReturnValueOnce([makePlacement(1), true, null])
      .mockReturnValueOnce([[makeDecision(['hub'])], true, null]);
    const { result, rerender } = renderHook(({ ns, placementName }) => useMeshPlacement(ns, placementName), {
      initialProps: { ns: 'mesh-ns', placementName: 'demo-placement' }
    });
    expect(result.current.selectedNames).toEqual(['hub']);
    rstest.mocked(useK8sWatchResource).mockReturnValueOnce([{}, false, null]).mockReturnValueOnce([[], false, null]);
    rerender({ ns: namespace, placementName: name });
    expect(result.current.selectedNames).toBeNull();
    expect(result.current.state).toBe('loading');
    expect(useK8sWatchResource).toHaveBeenNthCalledWith(3, expect.objectContaining({ namespace, name }));
    expect(useK8sWatchResource).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        namespace,
        selector: { matchLabels: { 'cluster.open-cluster-management.io/placement': name } }
      })
    );
    rstest
      .mocked(useK8sWatchResource)
      .mockReturnValueOnce([{ ...makePlacement(1), metadata: { namespace, name } }, true, null])
      .mockReturnValueOnce([[makeDecision(['spoke'])], true, null]);
    rerender({ ns: namespace, placementName: name });
    expect(result.current.selectedNames).toEqual(['spoke']);
  });
});
