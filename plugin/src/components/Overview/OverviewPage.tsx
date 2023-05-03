import * as React from 'react';
import { getKialiConfig, KialiConfig } from '../../kialiIntegration';
import {
  OverviewCard,
  OverviewToolbar,
  nameFilter,
  DirectionType,
  OverviewDisplayMode,
  OverviewType,
  sortFields,
  sortFunc
} from '@kiali/core-ui';
import {
  getNamespaces,
  ActiveFiltersInfo,
  PromisesRegistry,
  CanaryUpgradeStatus,
  NamespaceInfo,
  OutboundTrafficPolicy,
  ComponentStatus,
  SortField
} from '@kiali/types';
import {
  fetchCanaryStatus,
  fetchIstioStatus,
  fetchHealth,
  fetchTLS,
  fetchOutboundTrafficPolicyMode,
  fetchIstiodResourceThresholds,
  fetchValidations,
  fetchMetrics
} from './OverviewCalls';
import { Grid, GridItem } from '@patternfly/react-core';

const OverviewPage = () => {
  const [namespaces, setNamespaces] = React.useState<NamespaceInfo[]>([]);
  const [kialiConfig, setKialiConfig] = React.useState<KialiConfig>(undefined);
  const [canaryStatus, setCanaryStatus] = React.useState<CanaryUpgradeStatus>(undefined);
  const [displayMode, setDisplayMode] = React.useState<OverviewDisplayMode>(OverviewDisplayMode.EXPAND);
  const [duration, setDuration] = React.useState<number>(600);
  const [isAscending, setIsAscending] = React.useState<boolean>(true);
  const [direction, setDirection] = React.useState<DirectionType>('inbound');
  const [overviewType, setOverviewType] = React.useState<OverviewType>('app');
  const [outboundTrafficPolicy, setoutboundTrafficPolicy] = React.useState<OutboundTrafficPolicy>(undefined);
  const [canaryUpgrade, setCanaryUpgrade] = React.useState<boolean>(false);
  const [componentStatus, setComponentStatus] = React.useState<ComponentStatus[]>([]);
  const [isLoading, setLoading] = React.useState(true);
  const [istiodResourceThresholds, setIstiodResourceThresholds] = React.useState(undefined);
  const [activeFilters, setActiveFilters] = React.useState<ActiveFiltersInfo>({ filters: [], op: 'or' });
  const [sortField, setSortField] = React.useState<SortField<NamespaceInfo>>(sortFields[0]);
  const promises = new PromisesRegistry();

  React.useEffect(() => {
    getKialiConfig()
      .then(config => {
        setKialiConfig(config);
        load(activeFilters, config);
      })
      .catch(error => console.error('Error getting Kiali API config', error));
  }, [duration, isAscending, displayMode, overviewType, direction, activeFilters]);

  const load = (filters: ActiveFiltersInfo = activeFilters, conf: KialiConfig = kialiConfig) => {
    promises.cancelAll();
    promises.register('getNamespaces', getNamespaces()).then(namespacesResponse => {
      const nameFilters = filters.filters.filter(f => f.category === nameFilter.category);
      const allNamespaces: NamespaceInfo[] = namespacesResponse.data
        .filter(ns => {
          return nameFilters.length === 0 || nameFilters.some(f => ns.name.includes(f.value));
        })
        .map(ns => {
          const previous = namespaces.find(prev => prev.name === ns.name);
          return {
            name: ns.name,
            status: previous?.status,
            tlsStatus: previous?.tlsStatus,
            metrics: previous?.metrics,
            errorMetrics: previous?.errorMetrics,
            validations: previous?.validations,
            labels: ns.labels,
            controlPlaneMetrics: previous?.controlPlaneMetrics
          };
        });
      const sortNamespaces = sortFunc(allNamespaces, sortField, isAscending, conf.server);
      setNamespaces(sortNamespaces);
      fetchCanaryStatus(setCanaryStatus, setCanaryUpgrade);
      fetchIstioStatus(setComponentStatus);

      fetchHealth(sortNamespaces, isAscending, sortFields[0], overviewType, setNamespaces, conf.server);
      fetchTLS(sortNamespaces, isAscending, sortFields[0], conf.meshTLSStatus.status, setNamespaces, conf.server);
      fetchValidations(sortNamespaces, isAscending, sortFields[0], setNamespaces, conf.server);
      fetchOutboundTrafficPolicyMode(setoutboundTrafficPolicy);
      fetchIstiodResourceThresholds(setIstiodResourceThresholds);
      if (displayMode !== OverviewDisplayMode.COMPACT) {
        fetchMetrics(allNamespaces, duration, direction, setNamespaces, conf.server);
      }
      setLoading(false);
    });
  };

  const sort = (sortField: SortField<NamespaceInfo>, isAscending: boolean) => {
    setSortField(sortField);
    setNamespaces(sortFunc(namespaces, sortField, isAscending, kialiConfig.server));
  };

  const sm = displayMode === OverviewDisplayMode.COMPACT ? 3 : 6;
  const md = displayMode === OverviewDisplayMode.COMPACT ? 3 : 4;
  const lg = 12;
  return isLoading ? (
    <></>
  ) : (
    <>
      <OverviewToolbar
        displayMode={displayMode}
        setDisplayMode={setDisplayMode}
        overviewType={overviewType}
        setOverviewType={setOverviewType}
        onFilterChange={setActiveFilters}
        onRefresh={() => load()}
        sort={sort}
        sortField={sortField}
        isSortAscending={isAscending}
        duration={duration}
        setDuration={setDuration}
        direction={direction}
        setDirection={setDirection}
        updateSortDirection={setIsAscending}
        config={kialiConfig.server}
      />
      <Grid>
        {!isLoading &&
          sortFunc(namespaces, sortFields[0], isAscending, kialiConfig.server).map((ns, i) => {
            const isGreaterItem =
              ns.name === kialiConfig.server.istioNamespace &&
              displayMode === OverviewDisplayMode.EXPAND &&
              (kialiConfig.status.istioEnvironment.istioAPIEnabled || canaryUpgrade);
            return (
              <GridItem
                sm={isGreaterItem ? lg : sm}
                md={isGreaterItem ? lg : md}
                key={'CardItem_' + ns.name}
                style={{ margin: '0px 5px 0 5px' }}
              >
                <OverviewCard
                  ns={ns}
                  displayMode={displayMode}
                  istioNamespace={ns.name === kialiConfig.server.istioNamespace}
                  istioStatus={componentStatus}
                  hasCanaryUpgradeConfigured={canaryUpgrade}
                  canaryStatus={canaryStatus}
                  istioAPIEnabled={kialiConfig.status.istioEnvironment.istioAPIEnabled}
                  istiodResourceThresholds={istiodResourceThresholds}
                  setDisplayMode={setDisplayMode}
                  outboundTrafficPolicy={outboundTrafficPolicy}
                  overviewType={overviewType}
                  certificatesInformationIndicators={
                    kialiConfig.server.kialiFeatureFlags.certificatesInformationIndicators.enabled
                  }
                  certsTLSversion={kialiConfig.meshTLSStatus.minTLS}
                  certsInfo={kialiConfig.istioCerts}
                  config={kialiConfig.server}
                  direction={direction}
                  duration={duration}
                />
              </GridItem>
            );
          })}
      </Grid>
    </>
  );
};

export default OverviewPage;
