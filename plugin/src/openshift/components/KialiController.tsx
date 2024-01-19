import * as React from 'react';
import { bindActionCreators } from 'redux';
import { connect } from 'react-redux';
import { Namespace } from 'types/Namespace';
import { MessageType } from 'types/MessageCenter';
import { DurationInSeconds, IntervalInMilliseconds, PF_THEME_DARK, Theme } from 'types/Common';
import { JaegerInfo } from 'types/JaegerInfo';
import { toGrpcRate, toHttpRate, toTcpRate, TrafficRate } from 'types/Graph';
import { StatusKey, StatusState } from 'types/StatusState';
import { PromisesRegistry } from 'utils/CancelablePromises';
import * as API from 'services/Api';
import * as AlertUtils from 'utils/AlertUtils';
import { humanDurations, serverConfig, setServerConfig } from 'config/ServerConfig';
import { config } from 'config';
import { KialiDispatch } from 'types/Redux';
import { MessageCenterActions } from 'actions/MessageCenterActions';
import { LoginThunkActions } from 'actions/LoginThunkActions';
import { NamespaceActions } from 'actions/NamespaceAction';
import { UserSettingsActions } from 'actions/UserSettingsActions';
import { JaegerActions } from 'actions/JaegerActions';
import { LoginActions } from 'actions/LoginActions';
import { GraphToolbarActions } from 'actions/GraphToolbarActions';
import { HelpDropdownActions } from 'actions/HelpDropdownActions';
import { GlobalActions } from 'actions/GlobalActions';
import { getPluginConfig } from 'openshift/utils/KialiIntegration';
import { globalStyle } from 'styles/GlobalStyle';
import { kialiStyle } from 'styles/StyleUtils';
import { store } from 'store/ConfigStore';
import cssVariables from 'styles/variables.module.scss';

import 'tippy.js/dist/tippy.css';
import 'tippy.js/dist/themes/light-border.css';

// Enables ACE editor YAML themes
import 'ace-builds/src-noconflict/ace';
import 'ace-builds/src-noconflict/mode-yaml';
import 'ace-builds/src-noconflict/theme-eclipse';
import 'ace-builds/src-noconflict/theme-twilight';

// Enables the search box for the ACE editor
import 'ace-builds/src-noconflict/ext-searchbox';

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

const ossmcStyle = kialiStyle({
  display: 'flex',
  flexDirection: 'column',
  overflowY: 'auto'
});

interface KialiControllerReduxProps {
  addMessage: (content: string, detail: string, groupId?: string, msgType?: MessageType, showNotif?: boolean) => void;
  checkCredentials: () => void;
  setActiveNamespaces: (namespaces: Namespace[]) => void;
  setDuration: (duration: DurationInSeconds) => void;
  setJaegerInfo: (jaegerInfo: JaegerInfo | null) => void;
  setLandingRoute: (route: string | undefined) => void;
  setNamespaces: (namespaces: Namespace[], receivedAt: Date) => void;
  setRefreshInterval: (interval: IntervalInMilliseconds) => void;
  setTrafficRates: (rates: TrafficRate[]) => void;
  statusRefresh: (statusState: StatusState) => void;
}

type KialiControllerProps = KialiControllerReduxProps & {
  children: React.ReactNode;
};

class KialiControllerComponent extends React.Component<KialiControllerProps> {
  private promises = new PromisesRegistry();

  state = {
    configLoaded: false
  };

  componentDidMount(): void {
    this.getKialiConfig();
    this.setDocLayout();
  }

  componentWillUnmount() {
    this.promises.cancelAll();
  }

  render() {
    return this.state.configLoaded ? (
      <div className={`${globalStyle} ${ossmcStyle} ${cssVariables.style}`}>{this.props.children}</div>
    ) : (
      false
    );
  }

  private getKialiConfig = async () => {
    try {
      const getStatusPromise = this.promises
        .register('getStatus', API.getStatus())
        .then(response => this.processServerStatus(response.data))
        .catch(error => {
          AlertUtils.addError('Error fetching server status.', error, 'default', MessageType.WARNING);
        });
      const getJaegerInfoPromise = this.promises
        .register('getJaegerInfo', API.getJaegerInfo())
        .then(response => this.props.setJaegerInfo(response.data))
        .catch(error => {
          this.props.setJaegerInfo(null);
          AlertUtils.addError(
            'Could not fetch Jaeger info. Turning off Jaeger integration.',
            error,
            'default',
            MessageType.INFO
          );
        });
      const getNamespacesPromise = this.promises.register('getNamespaces', API.getNamespaces());
      const getServerConfigPromise = this.promises.register('getServerConfig', API.getServerConfig());

      const configs = await Promise.all([
        getNamespacesPromise,
        getServerConfigPromise,
        getStatusPromise,
        getJaegerInfoPromise
      ]);

      this.props.setNamespaces(configs[0].data, new Date());
      setServerConfig(configs[1].data);
      this.applyUIDefaults();
      this.setState({ configLoaded: true });
    } catch (err) {
      console.error('Error loading kiali config', err);
    }
  };

  private applyUIDefaults() {
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

      // Set graph implementation from plugin config
      if (uiDefaults.graph) {
        getPluginConfig()
          .then(config => (uiDefaults.graph.impl = config.graph.impl))
          .catch(e => console.error(e));
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
      this.props.setTrafficRates(rates);
    }
  }

  private setDocLayout = () => {
    // Set theme checking if Openshift Console has added Dark Theme CSS class
    const theme = document.documentElement.classList.contains(PF_THEME_DARK) ? Theme.DARK : Theme.LIGHT;
    store.dispatch(GlobalActions.setTheme(theme));

    // Set kiosk mode for OSSMC
    store.dispatch(GlobalActions.setKiosk('/'));
  };

  private processServerStatus = (status: StatusState) => {
    this.props.statusRefresh(status);

    if (status.status[StatusKey.DISABLED_FEATURES]) {
      this.props.addMessage(
        'The following features are disabled: ' + status.status[StatusKey.DISABLED_FEATURES],
        '',
        'default',
        MessageType.INFO,
        false
      );
    }
  };
}

const mapDispatchToProps = (dispatch: KialiDispatch) => ({
  addMessage: bindActionCreators(MessageCenterActions.addMessage, dispatch),
  checkCredentials: () => dispatch(LoginThunkActions.checkCredentials()),
  setActiveNamespaces: bindActionCreators(NamespaceActions.setActiveNamespaces, dispatch),
  setDuration: bindActionCreators(UserSettingsActions.setDuration, dispatch),
  setJaegerInfo: bindActionCreators(JaegerActions.setInfo, dispatch),
  setLandingRoute: bindActionCreators(LoginActions.setLandingRoute, dispatch),
  setNamespaces: bindActionCreators(NamespaceActions.receiveList, dispatch),
  setRefreshInterval: bindActionCreators(UserSettingsActions.setRefreshInterval, dispatch),
  setTrafficRates: bindActionCreators(GraphToolbarActions.setTrafficRates, dispatch),
  statusRefresh: bindActionCreators(HelpDropdownActions.statusRefresh, dispatch)
});

export const KialiController = connect(null, mapDispatchToProps)(KialiControllerComponent);
