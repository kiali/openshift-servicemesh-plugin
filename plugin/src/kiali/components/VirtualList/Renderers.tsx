import * as React from 'react';
import { Link } from 'react-router-dom';
import { Tooltip, TooltipPosition } from '@patternfly/react-core';
import * as FilterHelper from '../FilterList/FilterHelper';
import { appLabelFilter, versionLabelFilter } from '../../pages/WorkloadList/FiltersAndSorts';
import { MissingSidecar } from '../MissingSidecar/MissingSidecar';
import { noAmbientLabels, hasMissingSidecar, IstioTypes, Renderer, Resource, SortResource, TResource } from './Config';
import { HealthIndicator } from '../Health/HealthIndicator';
import { ValidationObjectSummary } from '../Validations/ValidationObjectSummary';
import { ValidationServiceSummary } from '../Validations/ValidationServiceSummary';
import { WorkloadListItem } from '../../types/Workload';
import { IstioConfigItem } from '../../types/IstioConfigList';
import { AppListItem } from '../../types/AppList';
import { ServiceListItem } from '../../types/ServiceList';
import { ActiveFilter } from '../../types/Filters';
import { renderAPILogo } from '../Logo/Logos';
import { Health } from '../../types/Health';
import { NamespaceInfo } from '../../pages/Overview/NamespaceInfo';
import { NamespaceMTLSStatus } from '../MTls/NamespaceMTLSStatus';
import { ValidationSummary } from '../Validations/ValidationSummary';
import { OverviewCardSparklineCharts } from '../../pages/Overview/OverviewCardSparklineCharts';
import { OverviewToolbar } from '../../pages/Overview/OverviewToolbar';
import { StatefulFilters } from '../Filters/StatefulFilters';
import { IstioObjectLink, GetIstioObjectUrl, infoStyle } from '../Link/IstioObjectLink';
import { labelFilter } from 'components/Filters/CommonFilters';
import { labelFilter as NsLabelFilter } from '../../pages/Overview/Filters';
import { ValidationSummaryLink } from '../Link/ValidationSummaryLink';
import { ValidationStatus } from '../../types/IstioObjects';
import { PFBadgeType, PFBadge, PFBadges } from 'components/Pf/PfBadges';
import { MissingLabel } from '../MissingLabel/MissingLabel';
import { MissingAuthPolicy } from 'components/MissingAuthPolicy/MissingAuthPolicy';
import { getReconciliationCondition } from 'utils/IstioConfigUtils';
import { Label } from 'components/Label/Label';
import { isMultiCluster, serverConfig } from 'config/ServerConfig';
import { ControlPlaneBadge } from 'pages/Overview/ControlPlaneBadge';
import { NamespaceStatuses } from 'pages/Overview/NamespaceStatuses';
import { isGateway, isWaypoint } from '../../helpers/LabelFilterHelper';
import { KialiIcon } from '../../config/KialiIcon';

// Links

const getLink = (item: TResource, config: Resource, query?: string) => {
  let url = config.name === 'istio' ? getIstioLink(item) : `/namespaces/${item.namespace}/${config.name}/${item.name}`;

  if (item.cluster && isMultiCluster() && !url.includes('cluster')) {
    if (url.includes('?')) {
      url = url + '&clusterName=' + item.cluster;
    } else {
      url = url + '?clusterName=' + item.cluster;
    }
  }
  if (query) {
    if (url.includes('?')) {
      url = url + '&' + query;
    } else {
      url = url + '?' + query;
    }
  }
  return url;
};

const getIstioLink = (item: TResource) => {
  const type = item['type'];

  return GetIstioObjectUrl(item.name, item.namespace, type, item.cluster);
};

// Cells

export const actionRenderer = (key: string, action: JSX.Element) => {
  return (
    <td role="gridcell" key={'VirtuaItem_Action_' + key} style={{ verticalAlign: 'middle' }}>
      {action}
    </td>
  );
};

export const details: Renderer<AppListItem | WorkloadListItem | ServiceListItem> = (
  item: AppListItem | WorkloadListItem | ServiceListItem
) => {
  const hasMissingSC = hasMissingSidecar(item);
  const hasMissingA = noAmbientLabels(item);
  const isWorkload = 'appLabel' in item;
  const isAmbientWaypoint = isWaypoint(item.labels);
  const hasMissingApp = isWorkload && !item['appLabel'] && !isWaypoint(item.labels);
  const hasMissingVersion = isWorkload && !item['versionLabel'] && !isWaypoint(item.labels);
  const additionalDetails = (item as WorkloadListItem | ServiceListItem).additionalDetailSample;
  const spacer = hasMissingSC && additionalDetails && additionalDetails.icon;
  const hasMissingAP = isWorkload && (item as WorkloadListItem).notCoveredAuthPolicy;

  // @ts-ignore
  return (
    <td
      role="gridcell"
      key={'VirtuaItem_Details_' + item.namespace + '_' + item.name}
      style={{ verticalAlign: 'middle', whiteSpace: 'nowrap' }}
    >
      <ul>
        {hasMissingAP && (
          <li>
            <MissingAuthPolicy namespace={item.namespace} />
          </li>
        )}
        {((hasMissingSC && hasMissingA && serverConfig.ambientEnabled) ||
          (!serverConfig.ambientEnabled && hasMissingSC)) && (
          <li>
            <MissingSidecar namespace={item.namespace} isGateway={isGateway(item.labels)} />
          </li>
        )}
        {isWorkload && (hasMissingApp || hasMissingVersion) && (
          <MissingLabel missingApp={hasMissingApp} missingVersion={hasMissingVersion} tooltip={false} />
        )}
        {spacer && ' '}
        {additionalDetails && additionalDetails.icon && (
          <li>{renderAPILogo(additionalDetails.icon, additionalDetails.title, 0)}</li>
        )}
        {item.istioReferences &&
          item.istioReferences.length > 0 &&
          item.istioReferences.map(ir => (
            <li key={ir.namespace ? `${ir.objectType}_${ir.name}_${ir.namespace}` : ir.name}>
              <PFBadge badge={PFBadges[ir.objectType]} position={TooltipPosition.top} />
              <IstioObjectLink
                name={ir.name}
                namespace={ir.namespace || ''}
                cluster={item.cluster}
                type={ir.objectType.toLowerCase()}
              >
                {ir.name}
              </IstioObjectLink>
            </li>
          ))}
        {isAmbientWaypoint && (
          <li>
            <PFBadge badge={PFBadges.Waypoint} position={TooltipPosition.top} />
            Waypoint Proxy
            <Tooltip
              key={`tooltip_missing_label`}
              position={TooltipPosition.top}
              content="Layer 7 service Mesh capabilities in Istio Ambient"
            >
              <KialiIcon.Info className={infoStyle} />
            </Tooltip>
          </li>
        )}
      </ul>
    </td>
  );
};

export const tls: Renderer<NamespaceInfo> = (ns: NamespaceInfo) => {
  return (
    <td role="gridcell" key={'VirtualItem_tls_' + ns.name} style={{ verticalAlign: 'middle' }}>
      {ns.tlsStatus ? <NamespaceMTLSStatus status={ns.tlsStatus.status} /> : undefined}
    </td>
  );
};

export const istioConfig: Renderer<NamespaceInfo> = (ns: NamespaceInfo) => {
  let validations: ValidationStatus = { objectCount: 0, errors: 0, warnings: 0 };
  if (!!ns.validations) {
    validations = ns.validations;
  }
  const status = (
    <td role="gridcell" key={'VirtuaItem_IstioConfig_' + ns.name} style={{ verticalAlign: 'middle' }}>
      <ValidationSummaryLink
        namespace={ns.name}
        objectCount={validations.objectCount}
        errors={validations.errors}
        warnings={validations.warnings}
      >
        <ValidationSummary
          id={'ns-val-' + ns.name}
          errors={validations.errors}
          warnings={validations.warnings}
          objectCount={validations.objectCount}
        />
      </ValidationSummaryLink>
    </td>
  );
  return status;
};

export const status: Renderer<NamespaceInfo> = (ns: NamespaceInfo) => {
  if (ns.status) {
    return (
      <td
        role="gridcell"
        key={'VirtuaItem_Status_' + ns.name}
        className="pf-m-center"
        style={{ verticalAlign: 'middle' }}
      >
        {ns.status && (
          <NamespaceStatuses
            key={ns.name}
            name={ns.name}
            status={ns.status}
            type={OverviewToolbar.currentOverviewType()}
          />
        )}
        <OverviewCardSparklineCharts
          key={ns.name}
          name={ns.name}
          duration={FilterHelper.currentDuration()}
          direction={OverviewToolbar.currentDirectionType()}
          metrics={ns.metrics}
          errorMetrics={ns.errorMetrics}
          controlPlaneMetrics={ns.controlPlaneMetrics}
        />
      </td>
    );
  }
  return <td role="gridcell" key={'VirtuaItem_Status_' + ns.name} />;
};

export const nsItem: Renderer<NamespaceInfo> = (ns: NamespaceInfo, _config: Resource, badge: PFBadgeType) => {
  return (
    <td role="gridcell" key={'VirtuaItem_NamespaceItem_' + ns.name} style={{ verticalAlign: 'middle' }}>
      <PFBadge badge={badge} />
      {ns.name}
      {ns.name === serverConfig.istioNamespace && <ControlPlaneBadge cluster={ns.cluster} />}
    </td>
  );
};

export const item: Renderer<TResource> = (item: TResource, config: Resource, badge: PFBadgeType) => {
  const key = 'link_definition_' + config.name + '_' + item.namespace + '_' + item.name;
  let serviceBadge = badge;
  if (item['serviceRegistry']) {
    switch (item['serviceRegistry']) {
      case 'External':
        serviceBadge = PFBadges.ExternalService;
        break;
      case 'Federation':
        serviceBadge = PFBadges.FederatedService;
        break;
    }
  }
  return (
    <td role="gridcell" key={'VirtuaItem_Item_' + item.namespace + '_' + item.name} style={{ verticalAlign: 'middle' }}>
      <PFBadge badge={serviceBadge} position={TooltipPosition.top} />
      <Link key={key} to={getLink(item, config)} className={'virtualitem_definition_link'}>
        {item.name}
      </Link>
    </td>
  );
};

// @TODO SortResource
export const cluster: Renderer<TResource> = (item: TResource) => {
  return (
    <td role="gridcell" key={'VirtuaItem_Cluster_' + item.cluster} style={{ verticalAlign: 'middle' }}>
      <PFBadge badge={PFBadges.Cluster} position={TooltipPosition.top} />
      {item.cluster}
    </td>
  );
};

export const namespace: Renderer<TResource> = (item: TResource) => {
  return (
    <td
      role="gridcell"
      key={'VirtuaItem_Namespace_' + item.namespace + '_' + item.name}
      style={{ verticalAlign: 'middle' }}
    >
      <PFBadge badge={PFBadges.Namespace} position={TooltipPosition.top} />
      {item.namespace}
    </td>
  );
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
      if (filter.category === appLabelFilter.category) {
        return filter.value === 'Present' && key === 'app';
      }
      return filter.value === 'Present' && key === 'version';
    }
  });
};

export const labels: Renderer<SortResource | NamespaceInfo> = (
  item: SortResource | NamespaceInfo,
  _: Resource,
  __: PFBadgeType,
  ___?: Health,
  statefulFilter?: React.RefObject<StatefulFilters>
) => {
  let path = window.location.pathname;
  path = path.substr(path.lastIndexOf('/console') + '/console'.length + 1);
  const labelFilt = path === 'overview' ? NsLabelFilter : labelFilter;
  const filters = FilterHelper.getFiltersFromURL([labelFilt, appLabelFilter, versionLabelFilter]);

  return (
    <td
      role="gridcell"
      key={'VirtuaItem_Labels_' + ('namespace' in item && `${item.namespace}_`) + item.name}
      style={{ verticalAlign: 'middle' }}
    >
      {item.labels &&
        Object.entries(item.labels).map(([key, value], i) => {
          const label = `${key}=${value}`;
          const labelAct = labelActivate(filters.filters, key, value, labelFilt.category);
          FilterHelper.getFiltersFromURL([labelFilt]).filters.forEach(f => console.log(`filter=|${f.value}|`));
          const isExactlyLabelFilter = FilterHelper.getFiltersFromURL([labelFilt]).filters.some(f =>
            f.value.includes(label)
          );
          const labelComponent = (
            <Label
              key={'label_' + i}
              name={key}
              value={value}
              style={{ cursor: isExactlyLabelFilter || !labelAct ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap' }}
              onClick={() =>
                statefulFilter
                  ? labelAct
                    ? isExactlyLabelFilter && statefulFilter.current!.removeFilter(labelFilt.category, label)
                    : statefulFilter.current!.filterAdded(labelFilt, label)
                  : {}
              }
            />
          );

          return statefulFilter ? (
            <Tooltip
              key={'Tooltip_Label_' + key + '_' + value}
              content={
                labelAct ? (
                  isExactlyLabelFilter ? (
                    <>Remove label from Filters</>
                  ) : (
                    <>Kiali can't remove the filter if is an expression</>
                  )
                ) : (
                  <>Add label to Filters</>
                )
              }
            >
              {labelComponent}
            </Tooltip>
          ) : (
            labelComponent
          );
        })}
    </td>
  );
};
export const health: Renderer<TResource> = (item: TResource, __: Resource, _: PFBadgeType, health?: Health) => {
  return (
    <td
      role="gridcell"
      key={'VirtuaItem_Health_' + item.namespace + '_' + item.name}
      style={{ verticalAlign: 'middle' }}
    >
      {health && <HealthIndicator id={item.name} health={health} />}
    </td>
  );
};

export const workloadType: Renderer<WorkloadListItem> = (item: WorkloadListItem) => {
  return (
    <td
      role="gridcell"
      key={'VirtuaItem_WorkloadType_' + item.namespace + '_' + item.name}
      style={{ verticalAlign: 'middle' }}
    >
      {item.type}
    </td>
  );
};

export const istioType: Renderer<IstioConfigItem> = (item: IstioConfigItem) => {
  const type = item.type;
  const object = IstioTypes[type];
  return (
    <td
      role="gridcell"
      key={'VirtuaItem_IstioType_' + item.namespace + '_' + item.name}
      style={{ verticalAlign: 'middle' }}
    >
      {object.name}
    </td>
  );
};

export const istioConfiguration: Renderer<IstioConfigItem> = (item: IstioConfigItem, config: Resource) => {
  const validation = item.validation;
  const reconciledCondition = getReconciliationCondition(item);
  const linkQuery: string = item['type'] ? 'list=yaml' : '';
  return (
    <td role="gridcell" key={'VirtuaItem_Conf_' + item.namespace + '_' + item.name} style={{ verticalAlign: 'middle' }}>
      {validation ? (
        <Link to={`${getLink(item, config, linkQuery)}`}>
          <ValidationObjectSummary
            id={item.name + '-config-validation'}
            validations={[validation]}
            reconciledCondition={reconciledCondition}
          />
        </Link>
      ) : (
        <>N/A</>
      )}
    </td>
  );
};

export const serviceConfiguration: Renderer<ServiceListItem> = (item: ServiceListItem, config: Resource) => {
  const validation = item.validation;
  const linkQuery: string = item['type'] ? 'list=yaml' : '';
  return (
    <td role="gridcell" key={'VirtuaItem_Conf_' + item.namespace + '_' + item.name} style={{ verticalAlign: 'middle' }}>
      {validation ? (
        <Link to={`${getLink(item, config, linkQuery)}`}>
          <ValidationServiceSummary id={item.name + '-service-validation'} validations={[validation]} />
        </Link>
      ) : (
        <>N/A</>
      )}
    </td>
  );
};
