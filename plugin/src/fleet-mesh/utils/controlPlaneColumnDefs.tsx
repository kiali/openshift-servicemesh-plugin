import type { TableColumn } from '@openshift-console/dynamic-plugin-sdk';
import type { EnrichedControlPlane } from '../types/istio';
import { getStatusRank } from './statusUtils';
import { sortWithComparator } from './tableCallbacks';

const compareCpMeshID = (a: EnrichedControlPlane, b: EnrichedControlPlane): number =>
  (a.meshID ?? '').localeCompare(b.meshID ?? '');
const compareCpStatusRank = (a: EnrichedControlPlane, b: EnrichedControlPlane): number =>
  getStatusRank(a.status?.conditions) - getStatusRank(b.status?.conditions);
const cpTypeRank = (cp: EnrichedControlPlane): number => (cp.managedBy ? 0 : cp.meshID ? 1 : 2);
const compareCpType = (a: EnrichedControlPlane, b: EnrichedControlPlane): number => cpTypeRank(a) - cpTypeRank(b);

export function buildControlPlaneTableColumns(t: (key: string) => string): TableColumn<EnrichedControlPlane>[] {
  return [
    { id: 'name', sort: 'metadata.name', title: t('Name') },
    {
      id: 'type',
      sort: (data: EnrichedControlPlane[], dir: string) => sortWithComparator(data, dir, compareCpType),
      title: t('Type')
    },
    {
      id: 'meshID',
      sort: (data: EnrichedControlPlane[], dir: string) => sortWithComparator(data, dir, compareCpMeshID),
      title: t('Mesh ID')
    },
    { id: 'cluster', sort: 'clusterName', title: t('Cluster') },
    { id: 'namespace', sort: 'controlPlaneNamespace', title: t('Namespace') },
    { id: 'version', sort: 'version', title: t('Version') },
    { id: 'observe', title: t('Observe') },
    { id: 'created', sort: 'metadata.creationTimestamp', title: t('Created') },
    {
      id: 'status',
      sort: (data: EnrichedControlPlane[], dir: string) => sortWithComparator(data, dir, compareCpStatusRank),
      title: t('Status')
    }
  ];
}

export const controlPlaneTableColumnOrder = [
  'name',
  'type',
  'meshID',
  'cluster',
  'namespace',
  'version',
  'observe',
  'created',
  'status'
] as const;

export const controlPlaneCardColumnOrder = ['name', 'cluster', 'namespace', 'version', 'observe', 'status'] as const;
