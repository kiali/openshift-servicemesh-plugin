import { combineReducers } from 'redux';
import { RootStateOrAny } from 'react-redux';

import {
  globalState,
  graphDataState,
  HelpDropdownState,
  IstioCertsInfoState,
  IstioStatusState,
  JaegerStateReducer,
  KialiAppState,
  loginState,
  MeshTlsState,
  messageCenter,
  MetricsStatsReducer,
  namespaceState,
  TourStateReducer,
  UserSettingsState
} from '@kiali/types';

export const getKialiState = (state: RootStateOrAny): KialiAppState => {
  return state.plugins?.kiali ?? state;
};

export default combineReducers({
  authentication: loginState,
  globalState: globalState,
  graph: graphDataState,
  messageCenter: messageCenter,
  namespaces: namespaceState,
  statusState: HelpDropdownState,
  userSettings: UserSettingsState,
  jaegerState: JaegerStateReducer,
  meshTLSStatus: MeshTlsState,
  istioStatus: IstioStatusState,
  istioCertsInfo: IstioCertsInfoState,
  tourState: TourStateReducer,
  metricsStats: MetricsStatsReducer
});
