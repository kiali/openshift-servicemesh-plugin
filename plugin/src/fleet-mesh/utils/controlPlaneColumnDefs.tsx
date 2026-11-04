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
    {
      id: 'name',
      sort: 'metadata.name',
      title: t('Name'),
      props: {
        info: {
          tooltip: t(
            'The name of the Istio custom resource for this control plane. Links to the control plane detail page.'
          )
        }
      }
    },
    {
      id: 'type',
      sort: (data: EnrichedControlPlane[], dir: string) => sortWithComparator(data, dir, compareCpType),
      title: t('Type'),
      props: {
        info: {
          tooltip: t(
            'Managed: created for a MultiClusterMesh. Discovered: part of an unmanaged multi-cluster mesh. Standalone: not associated with a mesh.'
          )
        }
      }
    },
    {
      id: 'meshID',
      sort: (data: EnrichedControlPlane[], dir: string) => sortWithComparator(data, dir, compareCpMeshID),
      title: t('Mesh ID'),
      props: {
        info: {
          tooltip: t('The identity shared by the control planes of a mesh, when this control plane belongs to one.')
        }
      }
    },
    {
      id: 'cluster',
      sort: 'clusterName',
      title: t('Cluster'),
      props: {
        info: { tooltip: t('The managed cluster where this control plane runs. Links to the ACM cluster detail page.') }
      }
    },
    {
      id: 'namespace',
      additional: true,
      sort: 'controlPlaneNamespace',
      title: t('Namespace'),
      props: { info: { tooltip: t('The namespace where the control plane runs on its cluster.') } }
    },
    {
      id: 'version',
      additional: true,
      sort: 'version',
      title: t('Version'),
      props: { info: { tooltip: t('The Istio version this control plane runs.') } }
    },
    {
      id: 'observe',
      additional: true,
      title: t('Observe'),
      props: {
        info: { tooltip: t('A link to observe this control plane in Kiali or OSSMC, when observability is available.') }
      }
    },
    {
      id: 'created',
      additional: true,
      sort: 'metadata.creationTimestamp',
      title: t('Created'),
      props: { info: { tooltip: t('When the Istio custom resource was created.') } }
    },
    {
      id: 'status',
      sort: (data: EnrichedControlPlane[], dir: string) => sortWithComparator(data, dir, compareCpStatusRank),
      title: t('Status'),
      props: { info: { tooltip: t('The Ready condition of the Istio custom resource, as reported by the operator.') } }
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
