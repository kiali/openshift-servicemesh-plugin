import { useMemo } from 'react';
import type { FC } from 'react';
import { Link } from 'react-router';
import { Card, CardBody, CardTitle, Label } from '@patternfly/react-core';
import type { EnrichedControlPlane } from '../types/istio';
import type { KialiLink } from '../types/kiali';
import { categorizeCp } from '../types/istio';
import { MeshStatus } from './MeshStatus';
import { VirtualFilterTable } from './VirtualFilterTable';
import type { CategoryLabel, VirtualFilterColumn } from './VirtualFilterTable';
import { cpTypeSegment } from '../utils/cpTypeSegment';
import { clusterDetailLink } from '../utils/linkUtils';
import { useKialiTranslation } from 'utils/I18nUtils';
import { controlPlaneLinkKey } from '../utils/kialiLinkUtils';
import { renderObservabilityLink } from './ObservabilityLinks';

const cpRowKey = (cp: EnrichedControlPlane): string => `${cp.clusterName}/${cp.metadata.name}`;
const cpSearchMatch = (cp: EnrichedControlPlane, query: string): boolean => {
  const q = query.toLowerCase();
  return cp.clusterName.toLowerCase().includes(q) || cp.metadata.name.toLowerCase().includes(q);
};

const ControlPlanesCard: FC<{ kialiLinks?: Map<string, KialiLink[]>; planes: EnrichedControlPlane[] }> = ({
  kialiLinks,
  planes
}) => {
  const { t } = useKialiTranslation();
  const hasKialiLinks = kialiLinks && kialiLinks.size > 0;

  // Labels are translated here so the i18n extractor sees the keys;
  // VirtualFilterTable replaces the {{count}} placeholder itself.
  const categoryLabels = useMemo<CategoryLabel[]>(
    () => [
      { key: 'all', label: t('All ({{count}})') },
      { key: 'ready', label: t('Ready ({{count}})') },
      { key: 'notReady', label: t('Not Ready ({{count}})') },
      { key: 'unknown', label: t('Unknown ({{count}})') }
    ],
    [t]
  );

  const columns = useMemo<VirtualFilterColumn<EnrichedControlPlane>[]>(() => {
    const cols: VirtualFilterColumn<EnrichedControlPlane>[] = [
      {
        key: 'name',
        headerTooltip: t('The name of the Istio control plane. Links to its detail page.'),
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
        key: 'cluster',
        headerTooltip: t('The cluster where this control plane runs.'),
        label: 'Cluster',
        render: cp => <Link to={clusterDetailLink(cp.clusterName)}>{cp.clusterName}</Link>,
        width: hasKialiLinks ? '20%' : '25%'
      },
      {
        key: 'namespace',
        headerTooltip: t('The namespace where this control plane (istiod) runs.'),
        label: 'Namespace',
        render: cp => cp.controlPlaneNamespace ?? '-',
        width: hasKialiLinks ? '15%' : '20%'
      },
      {
        key: 'version',
        headerTooltip: t('The Istio version of this control plane.'),
        label: 'Version',
        render: cp => cp.version ?? '-',
        width: '12%'
      }
    ];

    if (hasKialiLinks) {
      cols.push({
        key: 'observe',
        headerTooltip: t('Opens this control plane in Kiali or the OSSMC Service Mesh perspective.'),
        label: 'Observe',
        render: cp => {
          const links = kialiLinks.get(controlPlaneLinkKey(cp.clusterName, cp.metadata.name));
          if (!links || links.length === 0) return '-';
          return renderObservabilityLink(links[0], t, { kiali: 'Kiali', ossmc: 'OSSMC' });
        },
        width: '20%'
      });
    }

    cols.push({
      key: 'status',
      headerTooltip: t('The readiness of this control plane, from its Istio CR Ready condition.'),
      label: 'Status',
      render: cp =>
        cp.status?.conditions ? (
          <MeshStatus conditions={cp.status.conditions} conditionType="Ready" isCompact />
        ) : (
          <Label color="grey">{t('Unknown')}</Label>
        ),
      width: '15%'
    });

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
          categoryLabels={categoryLabels}
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
