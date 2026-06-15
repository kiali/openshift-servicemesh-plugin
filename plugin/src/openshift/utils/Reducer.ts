import { combineReducers } from 'redux';
import { KialiAppState } from 'store/Store';
import { LoginStateReducer } from 'reducers/LoginState';
import { GlobalStateReducer } from 'reducers/GlobalState';
import { GraphDataStateReducer } from 'reducers/GraphDataState';
import { HelpDropdownStateReducer } from 'reducers/HelpDropdownState';
import { UserSettingsStateReducer } from 'reducers/UserSettingsState';
import { MeshTlsStateReducer } from 'reducers/MeshTlsState';
import { IstioStatusStateReducer } from 'reducers/IstioStatusState';
import { MetricsStatsStateReducer } from 'reducers/MetricsStatsState';
import { TourStateReducer } from 'reducers/TourState';
import { NamespaceStateReducer } from 'reducers/NamespaceState';
import { NamespacesListStateReducer } from 'reducers/NamespacesListState';
import { NotificationCenterReducer } from 'reducers/NotificationCenter';
import { KialiAppAction } from 'actions/KialiAppAction';
import { ClusterStateReducer } from 'reducers/ClusterState';
import { TracingStateReducer } from 'reducers/TracingState';
import { MeshDataStateReducer } from 'reducers/MeshDataState';
import { ChatAiStateReducer } from 'reducers/ChatAIState';
import { ServicesListStateReducer } from 'reducers/ServicesListState';
import { AppsListStateReducer } from 'reducers/AppsListState';
import { WorkloadsListStateReducer } from 'reducers/WorkloadsListState';

export default combineReducers<KialiAppState, KialiAppAction>({
  authentication: LoginStateReducer,
  aiChat: ChatAiStateReducer,
  clusters: ClusterStateReducer,
  globalState: GlobalStateReducer,
  graph: GraphDataStateReducer,
  istioStatus: IstioStatusStateReducer,
  mesh: MeshDataStateReducer,
  meshTLSStatus: MeshTlsStateReducer,
  notificationCenter: NotificationCenterReducer,
  metricsStats: MetricsStatsStateReducer,
  namespaces: NamespaceStateReducer,
  namespacesList: NamespacesListStateReducer,
  servicesList: ServicesListStateReducer,
  appsList: AppsListStateReducer,
  workloadsList: WorkloadsListStateReducer,
  statusState: HelpDropdownStateReducer,
  tourState: TourStateReducer,
  tracingState: TracingStateReducer,
  userSettings: UserSettingsStateReducer
});
