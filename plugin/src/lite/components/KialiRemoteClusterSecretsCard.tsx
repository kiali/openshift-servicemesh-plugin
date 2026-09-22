import { useMemo, useState } from 'react';
import type { FC } from 'react';
import { Link } from 'react-router-dom-v5-compat';
import { ResourceLink } from '@openshift-console/dynamic-plugin-sdk';
import { Card, CardBody, CardTitle, Flex, FlexItem } from '@patternfly/react-core';
import type { ISortBy, OnSort } from '@patternfly/react-table';
import {
  InnerScrollContainer,
  SortByDirection,
  Table,
  TableVariant,
  Tbody,
  Td,
  Th,
  Thead,
  Tr
} from '@patternfly/react-table';
import { getNamespaceSecretsListPath } from '../utils/namespaceResourceListPaths';
import { useKialiTranslation } from 'utils/I18nUtils';

export const VISIBLE_REMOTE_CLUSTER_SECRET_ROWS = 12;
const COMPACT_TABLE_ROW_HEIGHT_PX = 33;

interface KialiRemoteClusterSecretsCardProps {
  namespace: string;
  secretNames: string[];
}

export const KialiRemoteClusterSecretsCard: FC<KialiRemoteClusterSecretsCardProps> = ({ namespace, secretNames }) => {
  const { t } = useKialiTranslation();
  const [sortBy, setSortBy] = useState<ISortBy>({ index: 0, direction: SortByDirection.asc });
  const secretCount = secretNames.length;
  const shouldScroll = secretCount > VISIBLE_REMOTE_CLUSTER_SECRET_ROWS;
  const scrollMaxHeight = `${VISIBLE_REMOTE_CLUSTER_SECRET_ROWS * COMPACT_TABLE_ROW_HEIGHT_PX}px`;
  const secretsListPath = getNamespaceSecretsListPath(namespace);
  const title = `${t('Remote Cluster Secrets')} (${secretCount})`;

  const sortedSecretNames = useMemo(() => {
    const names = [...secretNames];
    names.sort((a, b) => {
      const comparison = a.localeCompare(b);
      return sortBy.direction === SortByDirection.asc ? comparison : -comparison;
    });
    return names;
  }, [secretNames, sortBy.direction]);

  const onSort: OnSort = (_event, index, direction) => {
    setSortBy({ index, direction });
  };

  if (!namespace || secretCount === 0) {
    return null;
  }

  const table = (
    <Table aria-label={title} isStickyHeader={shouldScroll} variant={TableVariant.compact}>
      <Thead>
        <Tr>
          <Th sort={{ columnIndex: 0, onSort, sortBy }}>{t('Name')}</Th>
        </Tr>
      </Thead>
      <Tbody>
        {sortedSecretNames.map(secretName => (
          <Tr key={secretName}>
            <Td dataLabel={t('Name')}>
              <ResourceLink kind="Secret" name={secretName} namespace={namespace} />
            </Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  );

  return (
    <Card isCompact>
      <CardTitle>
        <Flex alignItems={{ default: 'alignItemsCenter' }} justifyContent={{ default: 'justifyContentSpaceBetween' }}>
          <FlexItem>
            <strong>{title}</strong>
          </FlexItem>
          <FlexItem>
            <Link to={secretsListPath}>{t('View all secrets')}</Link>
          </FlexItem>
        </Flex>
      </CardTitle>
      <CardBody>
        {shouldScroll ? (
          <InnerScrollContainer data-testid="remote-cluster-secrets-scroll" style={{ maxHeight: scrollMaxHeight }}>
            {table}
          </InnerScrollContainer>
        ) : (
          table
        )}
      </CardBody>
    </Card>
  );
};
