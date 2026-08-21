// Must run before ChatAIStateReducer pulls in PatternFly Chatbot/Monaco, which would
// otherwise inherit Console's relative worker-yaml.js URL under this plugin's publicPath.
import './MonacoEnvironmentSetup';

import { combineReducers } from 'redux';
import type { KialiAppState } from 'store/Store';
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
import type { KialiAppAction } from 'actions/KialiAppAction';
import { ClusterStateReducer } from 'reducers/ClusterState';
import { TracingStateReducer } from 'reducers/TracingState';
import { MeshDataStateReducer } from 'reducers/MeshDataState';
import { ChatAiStateReducer } from 'reducers/ChatAIState';

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
  statusState: HelpDropdownStateReducer,
  tourState: TourStateReducer,
  tracingState: TracingStateReducer,
  userSettings: UserSettingsStateReducer
});
