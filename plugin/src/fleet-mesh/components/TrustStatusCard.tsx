import { useMemo } from 'react';
import type { FC } from 'react';
import { Link } from 'react-router-dom-v5-compat';
import { Trans } from 'react-i18next';
import { useK8sWatchResource, Timestamp } from '@openshift-console/dynamic-plugin-sdk';
import { Card, CardBody, CardTitle, EmptyState, EmptyStateBody, Spinner, Title } from '@patternfly/react-core';
import type { ClusterMeshStatus } from '../types/multiClusterMesh';
import type { Certificate } from '../types/certManager';
import type { K8sCondition } from '../types/common';
import { certificateGroupVersionKind } from '../types/certManager';
import { clusterDetailLink } from '../utils/linkUtils';
import { MeshStatus } from './MeshStatus';
import { VirtualFilterTable } from './VirtualFilterTable';
import type { CategoryLabel, VirtualFilterColumn } from './VirtualFilterTable';
import { useKialiTranslation } from 'utils/I18nUtils';
import { clusterMeshStatusRowKey, clusterMeshStatusSearchMatch } from '../utils/tableCallbacks';

const CLUSTER_NAME_LABEL = 'mesh.open-cluster-management.io/cluster-name';
const MESH_NAME_LABEL = 'mesh.open-cluster-management.io/mesh-name';

function findCondition(conditions: ClusterMeshStatus['conditions'], type: string): K8sCondition | undefined {
  return conditions?.find(c => c.type === type);
}

type TrustCategory = 'ready' | 'pending' | 'failed';

function categorizeTrust(cs: ClusterMeshStatus): TrustCategory {
  const trust = findCondition(cs.conditions, 'TrustDistributed');
  if (!trust || trust.status === 'Unknown') return 'pending';
  if (trust.status === 'True') return 'ready';
  return trust.reason === 'CacertsPending' ? 'pending' : 'failed';
}

interface TrustStatusCardProps {
  clusterStatuses: ClusterMeshStatus[];
  issuerName: string;
  meshName: string;
  meshNamespace: string;
}

/**
 * Card displaying per-cluster trust status. The primary status source is the
 * per-cluster TrustDistributed condition on the MultiClusterMesh status; the
 * cert-manager Certificate watch is kept only for the expiry and renewal
 * timestamps, which the condition does not carry.
 */
export const TrustStatusCard: FC<TrustStatusCardProps> = ({ clusterStatuses, issuerName, meshName, meshNamespace }) => {
  const { t } = useKialiTranslation();
  const hasIssuer = !!issuerName;

  const [certs, certsLoaded, certsError] = useK8sWatchResource<Certificate[]>(
    hasIssuer
      ? {
          groupVersionKind: certificateGroupVersionKind,
          isList: true,
          namespace: meshNamespace,
          selector: {
            matchLabels: { [MESH_NAME_LABEL]: meshName }
          }
        }
      : null
  );

  const certsByCluster = useMemo(() => {
    const map = new Map<string, Certificate>();
    for (const cert of certs ?? []) {
      const clusterName = cert.metadata?.labels?.[CLUSTER_NAME_LABEL];
      if (clusterName) map.set(clusterName, cert);
    }
    return map;
  }, [certs]);

  // Labels are translated here (in addition to VirtualFilterTable's t()) so the
  // i18n extractor sees the keys; the second t() is a no-op on translated text.
  const categoryLabels = useMemo<CategoryLabel[]>(
    () => [
      { key: 'all', label: t('All ({{count}})') },
      { key: 'ready', label: t('Distributed ({{count}})') },
      { key: 'pending', label: t('Pending ({{count}})') },
      { key: 'failed', label: t('Failed ({{count}})') }
    ],
    [t]
  );

  const columns = useMemo<VirtualFilterColumn<ClusterMeshStatus>[]>(
    () => [
      {
        key: 'cluster',
        headerTooltip: t('The selected cluster to which this trust status applies.'),
        label: t('Cluster'),
        render: cs => <Link to={clusterDetailLink(cs.clusterName)}>{cs.clusterName}</Link>,
        width: '25%'
      },
      {
        key: 'trustStatus',
        headerTooltip: t(
          'The per-cluster TrustDistributed condition reported by the add-on controller in MultiClusterMesh status.'
        ),
        label: t('Trust Status'),
        render: cs => <MeshStatus conditions={cs.conditions} conditionType="TrustDistributed" isCompact />,
        width: '25%'
      },
      {
        key: 'expires',
        headerTooltip: t('When the per-cluster CA certificate expires.'),
        label: t('Expires'),
        render: cs => {
          const cert = certsByCluster.get(cs.clusterName);
          return cert?.status?.notAfter ? <Timestamp timestamp={cert.status.notAfter} /> : '-';
        },
        width: '25%'
      },
      {
        key: 'renews',
        headerTooltip: t('When cert-manager will renew the per-cluster CA certificate.'),
        label: t('Renews'),
        render: cs => {
          const cert = certsByCluster.get(cs.clusterName);
          return cert?.status?.renewalTime ? <Timestamp timestamp={cert.status.renewalTime} /> : '-';
        },
        width: '25%'
      }
    ],
    [certsByCluster, t]
  );

  if (!hasIssuer) {
    return (
      <Card isCompact>
        <CardTitle>
          <strong>{t('Trust Status')}</strong>
        </CardTitle>
        <CardBody>
          <EmptyState variant="xs">
            <EmptyStateBody>
              <Trans
                t={t}
                i18nKey="Trust is not configured for this mesh. Set <code>spec.security.trust.certManager.issuerRef</code> on the MultiClusterMesh to enable CA trust distribution."
                components={{ code: <code /> }}
                shouldUnescape
              />
            </EmptyStateBody>
          </EmptyState>
        </CardBody>
      </Card>
    );
  }

  if (certsError) {
    return (
      <Card isCompact>
        <CardTitle>
          <strong>{t('Trust Status')}</strong>
        </CardTitle>
        <CardBody>
          <EmptyState variant="xs">
            <Title headingLevel="h4" size="md">
              {t('Unable to load certificate data')}
            </Title>
            <EmptyStateBody>{t('An unexpected error occurred.')}</EmptyStateBody>
          </EmptyState>
        </CardBody>
      </Card>
    );
  }

  if (!certsLoaded) {
    return (
      <Card isCompact>
        <CardTitle>
          <strong>{t('Trust Status')}</strong>
        </CardTitle>
        <CardBody>
          <Spinner aria-label={t('Loading trust status')} size="lg" />
        </CardBody>
      </Card>
    );
  }

  if (clusterStatuses.length === 0) {
    return (
      <Card isCompact>
        <CardTitle>
          <strong>{t('Trust Status')}</strong>
        </CardTitle>
        <CardBody>
          <EmptyState variant="xs">
            <EmptyStateBody>{t('No clusters are part of this mesh yet.')}</EmptyStateBody>
          </EmptyState>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card isCompact>
      <CardTitle>
        <strong>{t('Trust Status ({{count}})', { count: clusterStatuses.length })}</strong>
      </CardTitle>
      <CardBody>
        <VirtualFilterTable
          categorize={categorizeTrust}
          categoryLabels={categoryLabels}
          columns={columns}
          emptyMessage="No clusters match the current filter."
          items={clusterStatuses}
          rowKey={clusterMeshStatusRowKey}
          searchMatch={clusterMeshStatusSearchMatch}
          searchPlaceholder="Filter by cluster name"
        />
      </CardBody>
    </Card>
  );
};
