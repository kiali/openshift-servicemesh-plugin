import * as React from 'react';
import {
  ListPageBody,
  RowProps,
  TableColumn,
  TableData,
  useActiveColumns,
  VirtualizedTable
} from '@openshift-console/dynamic-plugin-sdk';
import { cellWidth, sortable, textCenter } from '@patternfly/react-table';
import {
  ActiveFiltersInfo,
  ActiveFilter,
  ComponentStatus,
  NamespaceInfo,
  IstiodResourceThresholds
} from '@kiali/types';
import {
  ControlPlaneBadge,
  Label,
  NamespaceStatuses,
  NamespaceMTLSStatus,
  OverviewCardSparklineCharts,
  OverviewType,
  PFBadge,
  PFBadges,
  ValidationSummary,
  DirectionType
} from '@kiali/core-ui';
import { KialiConfig } from 'src/kialiIntegration';

const columns: TableColumn<NamespaceInfo>[] = [
  {
    id: 'tls',
    sort: 'tls',
    title: 'TLS'
  },
  {
    id: 'ns',
    sort: 'name',
    title: 'Namespace',
    transforms: [sortable]
  },
  {
    id: 'config',
    sort: 'config',
    title: 'Config'
  },
  {
    id: 'labels',
    sort: 'labels',
    title: 'Labels'
  },
  {
    id: 'status',
    sort: 'status',
    title: 'Status',
    transforms: [cellWidth(40)],
    cellTransforms: [textCenter]
  }
];

const useOverviewTableColumns = () => {
  const [activeColumns] = useActiveColumns<NamespaceInfo>({
    columns: columns,
    showNamespaceOverride: false,
    columnManagementID: ''
  });

  return activeColumns;
};

const labelActivate = (filters: ActiveFilter[], key: string, value: string, id: string) => {
  return filters.some(filter => {
    if (filter.category === id) {
      if (filter.value.includes('=')) {
        const [k, v] = filter.value.split('=');
        if (k === key) {
          return v.split(',').some(val => value.split(',').some(vl => vl.trim().startsWith(val.trim())));
        }
        return false;
      }
      return key === filter.value;
    } else {
      if (filter.category === 'App Label') {
        return filter.value === 'Present' && key === 'app';
      }
      return filter.value === 'Present' && key === 'version';
    }
  });
};

const Row = (
  { obj, activeColumnIDs }: RowProps<NamespaceInfo>,
  istioStatus: ComponentStatus[],
  filters: ActiveFiltersInfo,
  overviewType: OverviewType,
  duration: number,
  direction: DirectionType,
  istiodResourceThresholds: IstiodResourceThresholds,
  config: KialiConfig
) => {
  //{obj.name === istioNamespace && <ControlPlaneBadge status={istioStatus} />}
  return (
    <>
      <TableData id={columns[0].id} activeColumnIDs={activeColumnIDs}>
        {obj.tlsStatus ? <NamespaceMTLSStatus status={obj.tlsStatus.status} /> : undefined}
      </TableData>
      <TableData id={columns[1].id} activeColumnIDs={activeColumnIDs}>
        <PFBadge badge={PFBadges.Namespace} />
        {obj.name}
        {obj.name === config.server.istioNamespace && <ControlPlaneBadge status={istioStatus} />}
      </TableData>
      <TableData id={columns[2].id} activeColumnIDs={activeColumnIDs}>
        <ValidationSummary
          id={'ns-val-' + obj.name}
          errors={obj.validations.errors}
          warnings={obj.validations.warnings}
          objectCount={obj.validations.objectCount}
        />
      </TableData>
      <TableData id={columns[3].id} activeColumnIDs={activeColumnIDs}>
        {Object.entries(obj.labels).map(([key, value], i) => {
          const label = `${key}=${value}`;
          const labelAct = labelActivate(filters.filters, key, String(value), 'Namespace Label');
          const isExactlyLabelFilter = filters.filters.some(f => f.value.includes(label));
          return (
            <Label
              key={'label_' + i}
              name={key}
              value={value}
              style={{ cursor: isExactlyLabelFilter || !labelAct ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap' }}
            />
          );
        })}
      </TableData>
      <TableData id={columns[4].id} activeColumnIDs={activeColumnIDs}>
        {obj.status && <NamespaceStatuses ns={obj} type={overviewType} />}
        <OverviewCardSparklineCharts
          key={obj.name}
          name={obj.name}
          duration={duration}
          direction={direction}
          metrics={obj.metrics}
          errorMetrics={obj.errorMetrics}
          controlPlaneMetrics={obj.controlPlaneMetrics}
          config={config.server}
          isIstioNamespace={obj.name === config.server.istioNamespace}
          istioAPIEnabled={config.status.istioEnvironment.istioAPIEnabled}
          istiodResourceThresholds={istiodResourceThresholds}
        />
      </TableData>
    </>
  );
};

type IstioTableProps = {
  columns: TableColumn<NamespaceInfo>[];
  data: NamespaceInfo[];
  unfilteredData: NamespaceInfo[];
  loaded: boolean;
  loadError?: {
    message?: string;
  };
  istioStatus: ComponentStatus[];
  filters: ActiveFiltersInfo;
  overviewType: OverviewType;
  duration: number;
  direction: DirectionType;
  config: KialiConfig;
  istiodResourceThresholds: IstiodResourceThresholds;
};

const IstioTable = ({
  columns,
  data,
  unfilteredData,
  loaded,
  loadError,
  istioStatus,
  filters,
  overviewType,
  duration,
  direction,
  istiodResourceThresholds,
  config
}: IstioTableProps) => {
  return (
    <VirtualizedTable<NamespaceInfo>
      data={data}
      unfilteredData={unfilteredData}
      loaded={loaded}
      loadError={loadError}
      columns={columns}
      Row={(obj: RowProps<NamespaceInfo>) =>
        Row(obj, istioStatus, filters, overviewType, duration, direction, istiodResourceThresholds, config)
      }
    />
  );
};

type OverviewListProps = {
  namespaces: NamespaceInfo[];
  istioStatus: ComponentStatus[];
  filters: ActiveFiltersInfo;
  overviewType: OverviewType;
  duration: number;
  direction: DirectionType;
  config: KialiConfig;
  istiodResourceThresholds: IstiodResourceThresholds;
};
export const OverviewList = (props: OverviewListProps) => {
  return (
    <ListPageBody>
      <IstioTable
        columns={useOverviewTableColumns()}
        data={props.namespaces}
        unfilteredData={props.namespaces}
        loaded={true}
        istioStatus={props.istioStatus}
        filters={props.filters}
        overviewType={props.overviewType}
        duration={props.duration}
        direction={props.direction}
        config={props.config}
        istiodResourceThresholds={props.istiodResourceThresholds}
      />
    </ListPageBody>
  );
};
