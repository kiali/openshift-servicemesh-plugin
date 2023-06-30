import { combineReducers } from 'redux';
import { RootStateOrAny } from 'react-redux';
import { KialiAppState } from 'store/Store';
import loginState from 'reducers/LoginState';
import globalState from 'reducers/GlobalState';
import graphDataState from 'reducers/GraphDataState';
import HelpDropdownState from 'reducers/HelpDropdownState';
import UserSettingsState from 'reducers/UserSettingsState';
import JaegerStateReducer from 'reducers/JaegerState';
import MeshTlsState from 'reducers/MeshTlsState';
import IstioStatusState from 'reducers/IstioStatusState';
import IstioCertsInfoState from 'reducers/IstioCertsInfoState';
import MetricsStatsReducer from 'reducers/MetricsStatsState';
import tour from 'reducers/TourState';
import namespaces from 'reducers/NamespaceState';
import Messages from 'reducers/MessageCenter';

/**
 * If no redux provider is set in the OSSMC page (like IstioConfigListPage),
 * KialiAppState is stored as an extension of Openshift Console state (under state.plugins.kiali)
 * This method gets the correct Kiali state whether if the redux provider is set or not
 */
export const getKialiState = (state: RootStateOrAny): KialiAppState => {
  return state.plugins?.kiali ?? state;
};

export default combineReducers({
  authentication: loginState,
  globalState: globalState,
  graph: graphDataState,
  messageCenter: Messages,
  namespaces: namespaces,
  statusState: HelpDropdownState,
  userSettings: UserSettingsState,
  jaegerState: JaegerStateReducer,
  meshTLSStatus: MeshTlsState,
  istioStatus: IstioStatusState,
  istioCertsInfo: IstioCertsInfoState,
  tourState: tour,
  metricsStats: MetricsStatsReducer
});
