
import { getCanaryUpgradeStatus, getConfigValidations, getAllIstioConfigs, getNamespaceMetrics, computePrometheusRateParams,
     getNamespaceAppHealth, getNamespaceTls, getIstiodResourceThresholds, getNamespaceServiceHealth, getNamespaceWorkloadHealth, getIstioStatus,
     CanaryUpgradeStatus, DurationInSeconds, NamespaceInfo, NamespaceAppHealth, NamespaceWorkloadHealth, NamespaceServiceHealth, 
     Health, NamespaceStatus, PromisesRegistry, SortField, ComponentStatus, OverviewType, ComputedServerConfig, nsWideMTLSStatus,
     FAILURE, DEGRADED,HEALTHY, NOT_READY, sortFunc, OutboundTrafficPolicy, getOutboundTrafficPolicyMode, IstiodResourceThresholds, DirectionType, IstioMetricsOptions } from '@kiali/core-ui';
import _ from 'lodash';

const defaultDuration = 600;

export const fetchIstioStatus = (kialiProxy: string, setComponentStatus: React.Dispatch<React.SetStateAction<ComponentStatus[]>>) => {
  getIstioStatus(kialiProxy)
      .then(response => {
        setComponentStatus(response.data);
      })
      .catch(error => {
        console.error('Error fetching istio status components.', error);
      });
}
export const fetchCanaryStatus = (kialiProxy: string, setCanaryStatus: React.Dispatch<React.SetStateAction<CanaryUpgradeStatus>>, setCanaryUpgrade:  React.Dispatch<React.SetStateAction<boolean>>) => {
  getCanaryUpgradeStatus(kialiProxy)
      .then(response => {
        setCanaryStatus({
            currentVersion: response.data.currentVersion,
            upgradeVersion: response.data.upgradeVersion,
            migratedNamespaces: response.data.migratedNamespaces,
            pendingNamespaces: response.data.pendingNamespaces          
        });

        setCanaryUpgrade(response.data.pendingNamespaces.length > 0 || response.data.migratedNamespaces.length > 0)
      })
      .catch(error => {
        console.error('Error fetching canary upgrade status.', error);
      });
}
export const fetchMetrics = (namespaces: NamespaceInfo[], duration: number, direction: DirectionType ,setNamespaces: React.Dispatch<React.SetStateAction<NamespaceInfo[]>>, serverConfig: ComputedServerConfig, proxyUrl: string) => {
    const promises =  new PromisesRegistry();  
    // debounce async for back-pressure, ten by ten
    _.chunk(namespaces, 10).forEach(chunk => {
      promises
        .registerChained('metricschunks', undefined, () => fetchMetricsChunk(chunk, duration, direction, serverConfig, proxyUrl))
        .then(() => {
          setNamespaces(namespaces.slice())          
        });
    });
}

const fetchMetricsChunk = (chunk: NamespaceInfo[], duration: number, direction: DirectionType, serverConfig: ComputedServerConfig, proxyUrl: string) => {
  const rateParams = computePrometheusRateParams(serverConfig, duration, 10);
  const options: IstioMetricsOptions = {
    filters: ['request_count', 'request_error_count'],
    duration: duration,
    step: rateParams.step,
    rateInterval: rateParams.rateInterval,
    direction: direction,
    reporter: direction === 'inbound' ? 'destination' : 'source'
  };

  return Promise.all(
    chunk.map(nsInfo => {
      return getNamespaceMetrics(nsInfo.name, options, proxyUrl).then(rs => {
        nsInfo.metrics = rs.data.request_count;
        nsInfo.errorMetrics = rs.data.request_error_count;
        if (nsInfo.name === serverConfig.istioNamespace) {
          nsInfo.controlPlaneMetrics = {
            istiod_proxy_time: rs.data.pilot_proxy_convergence_time,
            istiod_cpu: rs.data.process_cpu_seconds_total,
            istiod_mem: rs.data.process_virtual_memory_bytes
          };
        }
        return nsInfo;
      });
    })
  ).catch(err => console.error('Could not fetch metrics in Kiali API', err));
}

export const fetchValidations = (namespaces: NamespaceInfo[], isAscending: boolean, sortField: SortField<NamespaceInfo>, setNamespaces: React.Dispatch<React.SetStateAction<NamespaceInfo[]>>, serverConfig: ComputedServerConfig,proxyUrl: string) => {
  const promises =  new PromisesRegistry();
  _.chunk(namespaces, 10).forEach(chunk => {
    promises
      .registerChained('validation', undefined, () => fetchValidationResult(chunk, proxyUrl))
      .then(() => {
        let newNamespaces = namespaces.slice();
        if (sortField.id === 'validations') {
          newNamespaces = sortFunc(newNamespaces, sortField, isAscending, serverConfig);
        }
        setNamespaces(newNamespaces)        
      });
  });
}

const fetchValidationResult = (chunk: NamespaceInfo[], proxyUrl: string) => {
  const nss: string[] = [];
  chunk.forEach(ns => {
    nss.push(ns.name);
  });

  return Promise.all([getConfigValidations(nss, proxyUrl), getAllIstioConfigs(nss, [], false, '', '', proxyUrl)])
    .then(results => {
      chunk.forEach(nsInfo => {
        nsInfo.validations = results[0].data[nsInfo.name];
        nsInfo.istioConfig = results[1].data[nsInfo.name];
      });
    })
    .catch(err => console.error('Could not fetch validations status from Kiali API', err));
}

export const fetchIstiodResourceThresholds = (setIstiodResourceThresholds: React.Dispatch<React.SetStateAction<IstiodResourceThresholds>>, proxyUrl: string) => {
  getIstiodResourceThresholds(proxyUrl)
      .then(response => {
        setIstiodResourceThresholds(response.data)
      })
      .catch(error => {
        console.error('Error fetching Istiod resource thresholds.', error);
      });
}
export const fetchTLS = (namespaces: NamespaceInfo[], isAscending: boolean, sortField: SortField<NamespaceInfo>, meshStatus: string, setNamespaces: React.Dispatch<React.SetStateAction<NamespaceInfo[]>>, serverConfig: ComputedServerConfig, proxyUrl: string) => {
  const promises =  new PromisesRegistry();
  _.chunk(namespaces, 10).forEach(chunk => {
    promises
      .registerChained('tlschunks', undefined, () => fetchTLSChunk(chunk, meshStatus, proxyUrl))
      .then(() => {        
        let newNamespaces = namespaces.slice();
            if (sortField.id === 'mtls') {
                newNamespaces = sortFunc(newNamespaces, sortField, isAscending, serverConfig)
            }
            setNamespaces(newNamespaces);       
      });
  });
}

const fetchTLSChunk = (chunk: NamespaceInfo[], meshStatus: string, proxyUrl: string) => {
  return Promise.all(
    chunk.map(nsInfo => {
      return getNamespaceTls(nsInfo.name, proxyUrl).then(rs => ({ status: rs.data, nsInfo: nsInfo }));
    })
  )
    .then(results => {
      results.forEach(result => {
        result.nsInfo.tlsStatus = {
          status: nsWideMTLSStatus(result.status.status, meshStatus),
          autoMTLSEnabled: result.status.autoMTLSEnabled,
          minTLS: result.status.minTLS
        };
      });
    })
    .catch(err => console.error('Could not fetch TLS status', err));
}

export const fetchOutboundTrafficPolicyMode = (setOutboundTrafficPolicy: React.Dispatch<React.SetStateAction<OutboundTrafficPolicy>> , proxyUrl: string) => {
  getOutboundTrafficPolicyMode(proxyUrl)
      .then(response => {
        setOutboundTrafficPolicy({ mode: response.data.mode });
      })
      .catch(error => {
        console.error('Error fetching Mesh OutboundTrafficPolicy.Mode.', error);
      });
}

export const fetchHealth = (namespaces: NamespaceInfo[] ,isAscending: boolean, sortField: SortField<NamespaceInfo>,
     type: OverviewType, setNamespaces: React.Dispatch<React.SetStateAction<NamespaceInfo[]>>, serverConfig: ComputedServerConfig, proxyUrl: string) => {
    const duration = defaultDuration;
    const promises =  new PromisesRegistry();
    // debounce async for back-pressure, ten by ten
    _.chunk(namespaces, 10).forEach(chunk => {
      promises
        .registerChained('healthchunks', undefined, () => fetchHealthChunk(chunk, duration, type, serverConfig, proxyUrl))
        .then(() => {
            let newNamespaces = namespaces.slice();
            if (sortField.id === 'health') {
                newNamespaces = sortFunc(newNamespaces, sortField, isAscending, serverConfig)
            }
            setNamespaces(newNamespaces);          
        })
        .catch(error => {
          if (error.isCanceled) {
            return;
          }
          console.error('Could not fetch health from Kiali API', error);
        });
    });
}

const fetchHealthChunk = (chunk: NamespaceInfo[], duration: DurationInSeconds, type: OverviewType, serverConfig: ComputedServerConfig, proxyUrl: string) => {
    const apiFunc = switchType(
      type,
      getNamespaceAppHealth,
      getNamespaceServiceHealth,
      getNamespaceWorkloadHealth
    );
    return Promise.all(
      chunk.map(nsInfo => {
        const healthPromise: Promise<NamespaceAppHealth | NamespaceWorkloadHealth | NamespaceServiceHealth> = apiFunc(
          serverConfig,
          nsInfo.name,
          duration,
          undefined,
          proxyUrl
        );
        return healthPromise.then(rs => ({ health: rs, nsInfo: nsInfo }));
      })
    )
      .then(results => {
        results.forEach(result => {
          const nsStatus: NamespaceStatus = {
            inNotReady: [],
            inError: [],
            inWarning: [],
            inSuccess: [],
            notAvailable: []
          };
          Object.keys(result.health).forEach(item => {
            const health: Health = result.health[item];
            const status = health.getGlobalStatus();
            if (status === FAILURE) {
              nsStatus.inError.push(item);
            } else if (status === DEGRADED) {
              nsStatus.inWarning.push(item);
            } else if (status === HEALTHY) {
              nsStatus.inSuccess.push(item);
            } else if (status === NOT_READY) {
              nsStatus.inNotReady.push(item);
            } else {
              nsStatus.notAvailable.push(item);
            }
          });
          result.nsInfo.status = nsStatus;          
        });
        return results;
      })
      .catch(err => console.error('Could not fetch health from Kiali API', err));
  }
export const switchType = <T, U, V>(type: OverviewType, caseApp: T, caseService: U, caseWorkload: V): T | U | V => {
  return type === 'app' ? caseApp : type === 'service' ? caseService : caseWorkload;
};
