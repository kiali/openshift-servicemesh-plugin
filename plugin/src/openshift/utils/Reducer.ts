import { combineReducers } from 'redux';
import { KialiAppState } from 'store/Store';
import { LoginStateReducer } from 'reducers/LoginState';
import { GlobalStateReducer } from 'reducers/GlobalState';
import { GraphDataStateReducer } from 'reducers/GraphDataState';
import { HelpDropdownStateReducer } from 'reducers/HelpDropdownState';
import { UserSettingsStateReducer } from 'reducers/UserSettingsState';
import { MeshTlsStateReducer } from 'reducers/MeshTlsState';
import { IstioStatusStateReducer } from 'reducers/IstioStatusState';
import { IstioCertsInfoStateReducer } from 'reducers/IstioCertsInfoState';
import { MetricsStatsStateReducer } from 'reducers/MetricsStatsState';
import { TourStateReducer } from 'reducers/TourState';
import { NamespaceStateReducer } from 'reducers/NamespaceState';
import { MessageCenterReducer } from 'reducers/MessageCenter';
import { KialiAppAction } from 'actions/KialiAppAction';
import { ClusterStateReducer } from 'reducers/ClusterState';
import { TracingStateReducer } from 'reducers/TracingState';
import { MeshDataStateReducer } from 'reducers/MeshDataState';

export default combineReducers<KialiAppState, KialiAppAction>({
  authentication: LoginStateReducer,
  clusters: ClusterStateReducer,
  globalState: GlobalStateReducer,
  graph: GraphDataStateReducer,
  istioStatus: IstioStatusStateReducer,
  istioCertsInfo: IstioCertsInfoStateReducer,
  mesh: MeshDataStateReducer,
  meshTLSStatus: MeshTlsStateReducer,
  messageCenter: MessageCenterReducer,
  metricsStats: MetricsStatsStateReducer,
  namespaces: NamespaceStateReducer,
  statusState: HelpDropdownStateReducer,
  tourState: TourStateReducer,
  tracingState: TracingStateReducer,
  userSettings: UserSettingsStateReducer
});
