import { useMemo } from 'react';
import type { FC } from 'react';
import { Link } from 'react-router-dom-v5-compat';
import { Card, CardBody, CardTitle, Label } from '@patternfly/react-core';
import type { EnrichedControlPlane } from '../types/istio';
import type { KialiLink } from '../types/kiali';
import { categorizeCp } from '../types/istio';
import { MeshStatus } from './MeshStatus';
import { VirtualFilterTable } from './VirtualFilterTable';
import type { CategoryLabel, VirtualFilterColumn } from './VirtualFilterTable';
import { cpTypeSegment } from '../utils/cpTypeSegment';
import { clusterDetailLink } from '../utils/linkUtils';
import { useMeshTranslation } from '../utils/i18nUtils';
import { controlPlaneLinkKey } from '../utils/kialiLinkUtils';
import { renderObservabilityLink } from './ObservabilityLinks';

const cpRowKey = (cp: EnrichedControlPlane): string => `${cp.clusterName}/${cp.metadata.name}`;
const cpSearchMatch = (cp: EnrichedControlPlane, query: string): boolean => {
  const q = query.toLowerCase();
  return cp.clusterName.toLowerCase().includes(q) || cp.metadata.name.toLowerCase().includes(q);
};

const CATEGORY_LABELS: CategoryLabel[] = [
  { key: 'all', label: 'All ({{count}})' },
  { key: 'ready', label: 'Ready ({{count}})' },
  { key: 'notReady', label: 'Not Ready ({{count}})' },
  { key: 'unknown', label: 'Unknown ({{count}})' }
];

const ControlPlanesCard: FC<{ kialiLinks?: Map<string, KialiLink[]>; planes: EnrichedControlPlane[] }> = ({
  kialiLinks,
  planes
}) => {
  const { t } = useMeshTranslation();
  const hasKialiLinks = kialiLinks && kialiLinks.size > 0;

  const columns = useMemo<VirtualFilterColumn<EnrichedControlPlane>[]>(() => {
    const cols: VirtualFilterColumn<EnrichedControlPlane>[] = [
      {
        key: 'cluster',
        label: 'Cluster',
        render: cp => <Link to={clusterDetailLink(cp.clusterName)}>{cp.clusterName}</Link>,
        width: hasKialiLinks ? '20%' : '25%'
      },
      {
        key: 'name',
        label: 'Name',
        render: cp => (
          <Link
            to={`/fleet-mesh/control-planes/${cpTypeSegment(cp)}/${encodeURIComponent(cp.clusterName)}/${encodeURIComponent(cp.metadata.name)}`}
          >
            {cp.metadata.name}
          </Link>
        ),
        width: hasKialiLinks ? '18%' : '20%'
      },
      {
        key: 'namespace',
        label: 'Namespace',
        render: cp => cp.controlPlaneNamespace ?? '-',
        width: hasKialiLinks ? '15%' : '20%'
      },
      { key: 'version', label: 'Version', render: cp => cp.version ?? '-', width: '12%' },
      {
        key: 'status',
        label: 'Status',
        render: cp =>
          cp.status?.conditions ? (
            <MeshStatus conditions={cp.status.conditions} conditionType="Ready" isCompact />
          ) : (
            <Label color="grey">{t('Unknown')}</Label>
          ),
        width: '15%'
      }
    ];

    if (hasKialiLinks) {
      cols.push({
        key: 'observe',
        label: 'Observe',
        render: cp => {
          const links = kialiLinks.get(controlPlaneLinkKey(cp.clusterName, cp.metadata.name));
          if (!links || links.length === 0) return '-';
          return renderObservabilityLink(links[0], t, { kiali: 'Kiali', ossmc: 'OSSMC' });
        },
        width: '20%'
      });
    }

    return cols;
  }, [hasKialiLinks, kialiLinks, t]);

  if (planes.length === 0) return null;

  return (
    <Card isCompact>
      <CardTitle>
        <strong>{t('Control Planes ({{count}})', { count: planes.length })}</strong>
      </CardTitle>
      <CardBody>
        <VirtualFilterTable
          categorize={categorizeCp}
          categoryLabels={CATEGORY_LABELS}
          columns={columns}
          emptyMessage="No control planes match the current filter."
          items={planes}
          rowKey={cpRowKey}
          searchMatch={cpSearchMatch}
          searchPlaceholder="Filter by cluster name"
        />
      </CardBody>
    </Card>
  );
};

export { ControlPlanesCard };
