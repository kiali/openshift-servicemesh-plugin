import * as React from 'react';
import {bindActionCreators} from 'redux';
import {connect} from 'react-redux';
import {Namespace} from 'types/Namespace';
import {MessageType} from 'types/MessageCenter';
import {DurationInSeconds, IntervalInMilliseconds, PF_THEME_DARK, Theme} from 'types/Common';
import {TracingInfo} from 'types/TracingInfo';
import {toGrpcRate, toHttpRate, toTcpRate, TrafficRate} from 'types/Graph';
import {StatusKey, StatusState} from 'types/StatusState';
import {PromisesRegistry} from 'utils/CancelablePromises';
import * as API from 'services/Api';
import * as AlertUtils from 'utils/AlertUtils';
import {humanDurations, serverConfig, setServerConfig} from 'config/ServerConfig';
import {config} from 'config';
import {KialiDispatch} from 'types/Redux';
import {MessageCenterActions} from 'actions/MessageCenterActions';
import {LoginThunkActions} from 'actions/LoginThunkActions';
import {NamespaceActions} from 'actions/NamespaceAction';
import {UserSettingsActions} from 'actions/UserSettingsActions';
import {TracingActions} from 'actions/TracingActions';
import {LoginActions} from 'actions/LoginActions';
import {GraphToolbarActions} from 'actions/GraphToolbarActions';
import {HelpDropdownActions} from 'actions/HelpDropdownActions';
import {GlobalActions} from 'actions/GlobalActions';
import {
  getDistributedTracingPluginManifest,
  getNetobservPluginManifest,
  getPluginConfig,
  OpenShiftPluginConfig,
  PluginConfig
} from 'openshift/utils/KialiIntegration';
import {MeshTlsActions} from 'actions/MeshTlsActions';
import {TLSStatus} from 'types/TLSStatus';
import {IstioCertsInfoActions} from 'actions/IstioCertsInfoActions';
import {CertsInfo} from 'types/CertsInfo';
import {store} from 'store/ConfigStore';
import {kialiStyle} from 'styles/StyleUtils';

declare global {
  interface Date {
    toLocaleStringWithConditionalDate(): string;
  }
}

// eslint-disable-next-line no-extend-native
Date.prototype.toLocaleStringWithConditionalDate = function () {
  const nowDate = new Date().toLocaleDateString();
  const thisDate = this.toLocaleDateString();

  return nowDate === thisDate ? this.toLocaleTimeString() : this.toLocaleString();
};

export const centerVerticalHorizontalStyle = kialiStyle({
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center'
});

interface KialiControllerReduxProps {
  addMessage: (content: string, detail: string, groupId?: string, msgType?: MessageType, showNotif?: boolean) => void;
  checkCredentials: () => void;
  setActiveNamespaces: (namespaces: Namespace[]) => void;
  setDuration: (duration: DurationInSeconds) => void;
  setIstioCertsInfo: (istioCertsInfo: CertsInfo[]) => void;
  setLandingRoute: (route: string | undefined) => void;
  setMeshTlsStatus: (tlsStatus: TLSStatus) => void;
  setNamespaces: (namespaces: Namespace[], receivedAt: Date) => void;
  setRefreshInterval: (interval: IntervalInMilliseconds) => void;
  setTracingInfo: (tracingInfo: TracingInfo | null) => void;
  setTrafficRates: (rates: TrafficRate[]) => void;
  statusRefresh: (statusState: StatusState) => void;
}

type KialiControllerProps = KialiControllerReduxProps & {
  children: React.ReactNode;
};

const defaultPluginConfig: PluginConfig = {
  observability: {
    instance: 'sample',
    namespace: 'tempo',
    tenant: 'default'
  }
};

let pluginConfig: PluginConfig = defaultPluginConfig;
export {pluginConfig};

let distributedTracingPluginConfig: OpenShiftPluginConfig;
export {distributedTracingPluginConfig};

let netobservPluginConfig: any;
export {netobservPluginConfig};

class KialiControllerComponent extends React.Component<KialiControllerProps> {
  private promises = new PromisesRegistry();

  state = {
    loaded: false
  };

  componentDidMount(): void {
    this.loadKiali();
  }

  componentWillUnmount(): void {
    this.promises.cancelAll();
  }

  render(): React.ReactNode {
    return this.state.loaded ? (
      <>{this.props.children}</>
    ) : (
      <h1 className={centerVerticalHorizontalStyle}>Loading...</h1>
    );
  }

  private loadKiali = async (): Promise<void> => {
    await this.getKialiConfig();

    this.applyUIDefaults();
    this.setDocLayout();
    this.setState({ loaded: true });
  };

  private getKialiConfig = async (): Promise<void> => {
    try {
      const getNamespacesPromise = this.promises
        .register('getNamespaces', API.getNamespaces())
        .then(response => this.props.setNamespaces(response.data, new Date()))
        .catch(error => {
          AlertUtils.addError('Error fetching namespaces.', error, 'default', MessageType.WARNING);
        });

      const getServerConfigPromise = this.promises
        .register('getServerConfig', API.getServerConfig())
        .then(response => setServerConfig(response.data))
        .catch(error => {
          AlertUtils.addError('Error fetching server config.', error, 'default', MessageType.WARNING);
        });

      const getTracingInfoPromise = this.promises
        .register('getTracingInfo', API.getTracingInfo())
        .then(response => this.props.setTracingInfo(response.data))
        .catch(error => {
          this.props.setTracingInfo(null);
          AlertUtils.addError(
            'Could not fetch Tracing info. Turning off Tracing integration.',
            error,
            'default',
            MessageType.INFO
          );
        });

      const getPluginPromise = this.promises
        .register('getPluginPromise', getPluginConfig())
        .then(response => {pluginConfig = response})
        .catch(error => {
          AlertUtils.addError('Error fetching plugin configuration.', error, 'default', MessageType.WARNING);
        });

      const getDistributedTracingPluginManifestPromise = this.promises
        .register('getDistributedTracingPluginManifestPromise', getDistributedTracingPluginManifest())
        .then(response => (distributedTracingPluginConfig = (response)))
        .catch(error => {
          console.debug(`Error fetching Distributed Tracing plugin configuration. (Probably is not installed) ${error}`)
          // For testing the distributed tracing integration locally, assign distributedTracingPluginConfig = "plugin manifest json"
        });
      const getNetobservPluginManifestPromise = this.promises
        .register('getNetobservPluginManifestPromise', getNetobservPluginManifest())
        .then(response => (netobservPluginConfig = (response)))
        .catch(error => {
          console.debug(`Failed to fetch Netobserv plugin configuration (plugin is not probably installed). ${error}`)
          // For testing the netobserv integration locally, assign netobservPluginConfig = "plugin manifest json"
        });
      API.getStatus()
        .then(response => this.processServerStatus(response.data))
        .catch(error => {
          AlertUtils.addError('Error fetching server status.', error, 'default', MessageType.WARNING);
        });

      await Promise.all([
        getNamespacesPromise,
        getServerConfigPromise,
        getTracingInfoPromise,
        getPluginPromise,
        getDistributedTracingPluginManifestPromise,
        getNetobservPluginManifestPromise
      ]);
    } catch (err) {
      console.error('Error loading kiali config', err);
    }
  };

  private applyUIDefaults = (): void => {
    const uiDefaults = serverConfig.kialiFeatureFlags.uiDefaults;
    if (uiDefaults) {
      // Duration (aka metricsPerRefresh)
      if (uiDefaults.metricsPerRefresh) {
        const validDurations = humanDurations(serverConfig, '', '');
        let metricsPerRefresh = 0;

        for (const [key, value] of Object.entries(validDurations)) {
          if (value === uiDefaults.metricsPerRefresh) {
            metricsPerRefresh = Number(key);
            break;
          }
        }

        if (metricsPerRefresh > 0) {
          this.props.setDuration(metricsPerRefresh);
          console.debug(
            `Setting UI Default: metricsPerRefresh [${uiDefaults.metricsPerRefresh}=${metricsPerRefresh}s]`
          );
        } else {
          console.debug(`Ignoring invalid UI Default: metricsPerRefresh [${uiDefaults.metricsPerRefresh}]`);
        }
      }

      // Refresh Interval
      let refreshInterval = -1;
      if (uiDefaults.refreshInterval) {
        for (const [key, value] of Object.entries(config.toolbar.refreshInterval)) {
          if (value.toLowerCase().endsWith(uiDefaults.refreshInterval.toLowerCase())) {
            refreshInterval = Number(key);
            break;
          }
        }

        if (refreshInterval >= 0) {
          this.props.setRefreshInterval(refreshInterval);
          console.debug(`Setting UI Default: refreshInterval [${uiDefaults.refreshInterval}=${refreshInterval}ms]`);
        } else {
          console.debug(`Ignoring invalid UI Default: refreshInterval [${uiDefaults.refreshInterval}]`);
        }
      }

      // Selected Namespaces
      if (uiDefaults.namespaces && uiDefaults.namespaces.length > 0) {
        // use store directly, we don't want to update on redux state change
        const namespaces = store.getState().namespaces.items;
        const namespaceNames: string[] = namespaces ? namespaces.map(ns => ns.name) : [];
        const activeNamespaces: Namespace[] = [];

        for (const name of uiDefaults.namespaces) {
          if (namespaceNames.includes(name)) {
            activeNamespaces.push({ name: name } as Namespace);
          } else {
            console.debug(`Ignoring invalid UI Default: namespace [${name}]`);
          }
        }

        if (activeNamespaces.length > 0) {
          this.props.setActiveNamespaces(activeNamespaces);
          console.debug(`Setting UI Default: namespaces ${JSON.stringify(activeNamespaces.map(ns => ns.name))}`);
        }
      }

      // Graph Traffic
      const grpcRate = toGrpcRate(uiDefaults.graph.traffic.grpc);
      const httpRate = toHttpRate(uiDefaults.graph.traffic.http);
      const tcpRate = toTcpRate(uiDefaults.graph.traffic.tcp);
      const rates: TrafficRate[] = [];

      if (grpcRate) {
        rates.push(TrafficRate.GRPC_GROUP, grpcRate);
      }

      if (httpRate) {
        rates.push(TrafficRate.HTTP_GROUP, httpRate);
      }

      if (tcpRate) {
        rates.push(TrafficRate.TCP_GROUP, tcpRate);
      }

      if (serverConfig.ambientEnabled) {
        rates.push(TrafficRate.AMBIENT_GROUP)
        rates.push(TrafficRate.AMBIENT_TOTAL)
      }

      this.props.setTrafficRates(rates);
    }
  };

  private setDocLayout = (): void => {
    // Set theme checking if Openshift Console has added Dark Theme CSS class
    const theme = document.documentElement.classList.contains(PF_THEME_DARK) ? Theme.DARK : Theme.LIGHT;
    store.dispatch(GlobalActions.setTheme(theme));

    // Set kiosk mode for OSSMC
    store.dispatch(GlobalActions.setKiosk('/'));
  };

  private processServerStatus = (status: StatusState): void => {
    this.props.statusRefresh(status);

    if (status.status[StatusKey.DISABLED_FEATURES]) {
      this.props.addMessage(
        `The following features are disabled: ${status.status[StatusKey.DISABLED_FEATURES]}`,
        '',
        'default',
        MessageType.INFO,
        false
      );
    }
  };
}

const mapDispatchToProps = (dispatch: KialiDispatch): KialiControllerReduxProps => ({
  addMessage: bindActionCreators(MessageCenterActions.addMessage, dispatch),
  checkCredentials: () => dispatch(LoginThunkActions.checkCredentials()),
  setActiveNamespaces: bindActionCreators(NamespaceActions.setActiveNamespaces, dispatch),
  setDuration: bindActionCreators(UserSettingsActions.setDuration, dispatch),
  setIstioCertsInfo: bindActionCreators(IstioCertsInfoActions.setinfo, dispatch),
  setTracingInfo: bindActionCreators(TracingActions.setInfo, dispatch),
  setLandingRoute: bindActionCreators(LoginActions.setLandingRoute, dispatch),
  setMeshTlsStatus: bindActionCreators(MeshTlsActions.setinfo, dispatch),
  setNamespaces: bindActionCreators(NamespaceActions.receiveList, dispatch),
  setRefreshInterval: bindActionCreators(UserSettingsActions.setRefreshInterval, dispatch),
  setTrafficRates: bindActionCreators(GraphToolbarActions.setTrafficRates, dispatch),
  statusRefresh: bindActionCreators(HelpDropdownActions.statusRefresh, dispatch)
});

export const KialiController = connect(
  null,
  mapDispatchToProps
)(KialiControllerComponent);