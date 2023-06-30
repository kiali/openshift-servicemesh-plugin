import * as React from 'react';
import { Button, ButtonVariant, ExpandableSection, Modal, ModalVariant, Tab, Tabs } from '@patternfly/react-core';
import { WorkloadOverview } from '../../types/ServiceInfo';
import * as API from '../../services/Api';
import { Response } from '../../services/Api';
import * as AlertUtils from '../../utils/AlertUtils';
import { RequestRouting } from './RequestRouting';
import { K8sRequestRouting } from './K8sRequestRouting';
import { TrafficShifting, WorkloadWeight } from './TrafficShifting';
import {
  TrafficPolicy,
  ConsistentHashType,
  TrafficPolicyState,
  UNSET
} from '../../components/IstioWizards/TrafficPolicy';
import { ROUND_ROBIN } from './TrafficPolicy';
import { FaultInjection, FaultInjectionRoute } from './FaultInjection';
import { Rule } from './RequestRouting/Rules';
import { K8sRule } from './K8sRequestRouting/K8sRules';
import {
  buildIstioConfig,
  fqdnServiceName,
  getInitConnectionPool,
  getInitFaultInjectionRoute,
  getInitGateway,
  getInitHosts,
  getInitK8sGateway,
  getInitK8sHosts,
  getInitLoadBalancer,
  getInitOutlierDetection,
  getInitPeerAuthentication,
  getInitRules,
  getInitK8sRules,
  getInitTimeoutRetryRoute,
  getInitTlsMode,
  getInitWeights,
  hasGateway,
  hasK8sGateway,
  ServiceWizardProps,
  ServiceWizardState,
  WIZARD_FAULT_INJECTION,
  WIZARD_K8S_REQUEST_ROUTING,
  WIZARD_REQUEST_ROUTING,
  WIZARD_REQUEST_TIMEOUTS,
  WIZARD_TCP_TRAFFIC_SHIFTING,
  WIZARD_TITLES,
  WIZARD_TRAFFIC_SHIFTING,
  WizardPreviews
} from './WizardActions';
import { MessageType } from '../../types/MessageCenter';
import { GatewaySelector, GatewaySelectorState } from './GatewaySelector';
import { K8sGatewaySelector, K8sGatewaySelectorState } from './K8sGatewaySelector';
import { VirtualServiceHosts } from './VirtualServiceHosts';
import { K8sRouteHosts } from './K8sRouteHosts';
import {
  DestinationRule,
  Gateway,
  K8sGateway,
  K8sHTTPRoute,
  PeerAuthentication,
  PeerAuthenticationMutualTLSMode,
  VirtualService
} from '../../types/IstioObjects';
import { style } from 'typestyle';
import { RequestTimeouts, TimeoutRetryRoute } from './RequestTimeouts';
import { CircuitBreaker, CircuitBreakerState } from './CircuitBreaker';
import _ from 'lodash';
import { ConfigPreviewItem, IstioConfigPreview } from 'components/IstioConfigPreview/IstioConfigPreview';
import { KialiIcon } from '../../config/KialiIcon';

const emptyServiceWizardState = (fqdnServiceName: string): ServiceWizardState => {
  return {
    showWizard: false,
    showAdvanced: false,
    showPreview: false,
    confirmationModal: false,
    previews: undefined,
    advancedTabKey: 0,
    workloads: [],
    rules: [],
    k8sRules: [],
    faultInjectionRoute: {
      workloads: [],
      delayed: false,
      delay: {
        percentage: {
          value: 100
        },
        fixedDelay: '5s'
      },
      isValidDelay: true,
      aborted: false,
      abort: {
        percentage: {
          value: 100
        },
        httpStatus: 503
      },
      isValidAbort: true
    },
    timeoutRetryRoute: {
      workloads: [],
      isTimeout: false,
      timeout: '2s',
      isValidTimeout: true,
      isRetry: false,
      retries: {
        attempts: 3,
        perTryTimeout: '2s',
        retryOn: 'gateway-error,connect-failure,refused-stream'
      },
      isValidRetry: true
    },
    valid: {
      mainWizard: true,
      vsHosts: true,
      k8sRouteHosts: true,
      tls: true,
      lb: true,
      gateway: true,
      cp: true,
      od: true
    },
    advancedOptionsValid: true,
    vsHosts: [fqdnServiceName],
    k8sRouteHosts: [fqdnServiceName],
    trafficPolicy: {
      tlsModified: false,
      mtlsMode: UNSET,
      clientCertificate: '',
      privateKey: '',
      caCertificates: '',
      addLoadBalancer: false,
      simpleLB: false,
      consistentHashType: ConsistentHashType.HTTP_HEADER_NAME,
      loadBalancer: {
        simple: ROUND_ROBIN
      },
      peerAuthnSelector: {
        addPeerAuthentication: false,
        addPeerAuthnModified: false,
        mode: PeerAuthenticationMutualTLSMode.UNSET
      },
      addConnectionPool: false,
      connectionPool: {},
      addOutlierDetection: false,
      outlierDetection: {}
    },
    gateway: undefined,
    k8sGateway: undefined
  };
};

const advancedOptionsStyle = style({
  marginTop: 10
});

export class ServiceWizard extends React.Component<ServiceWizardProps, ServiceWizardState> {
  constructor(props: ServiceWizardProps) {
    super(props);
    this.state = emptyServiceWizardState(fqdnServiceName(props.serviceName, props.namespace));
  }

  componentDidUpdate(prevProps: ServiceWizardProps) {
    if (prevProps.show !== this.props.show || !this.compareWorkloads(prevProps.workloads, this.props.workloads)) {
      let isMainWizardValid: boolean;
      switch (this.props.type) {
        // By default the rule of Weighted routing should be valid
        case WIZARD_TRAFFIC_SHIFTING:
          isMainWizardValid = true;
          break;
        case WIZARD_K8S_REQUEST_ROUTING:
          isMainWizardValid = false;
          break;
        // By default no rules is a no valid scenario
        case WIZARD_REQUEST_ROUTING:
          isMainWizardValid = false;
          break;
        case WIZARD_FAULT_INJECTION:
        case WIZARD_REQUEST_TIMEOUTS:
        default:
          isMainWizardValid = true;
          break;
      }
      const initVsHosts = getInitHosts(this.props.virtualServices);
      const initK8sRoutes = getInitK8sHosts(this.props.k8sHTTPRoutes);
      const [initMtlsMode, initClientCertificate, initPrivateKey, initCaCertificates] = getInitTlsMode(
        this.props.destinationRules
      );
      const initLoadBalancer = getInitLoadBalancer(this.props.destinationRules);
      let initConsistentHashType = ConsistentHashType.HTTP_HEADER_NAME;
      if (initLoadBalancer && initLoadBalancer.consistentHash) {
        if (initLoadBalancer.consistentHash.httpHeaderName) {
          initConsistentHashType = ConsistentHashType.HTTP_HEADER_NAME;
        } else if (initLoadBalancer.consistentHash.httpCookie) {
          initConsistentHashType = ConsistentHashType.HTTP_COOKIE;
        } else if (initLoadBalancer.consistentHash.useSourceIp) {
          initConsistentHashType = ConsistentHashType.USE_SOURCE_IP;
        }
      }

      const initPeerAuthentication = getInitPeerAuthentication(
        this.props.destinationRules,
        this.props.peerAuthentications
      );
      const initConnetionPool = getInitConnectionPool(this.props.destinationRules);
      const initOutlierDetection = getInitOutlierDetection(this.props.destinationRules);
      const trafficPolicy: TrafficPolicyState = {
        tlsModified: initMtlsMode !== '',
        mtlsMode: initMtlsMode !== '' ? initMtlsMode : UNSET,
        clientCertificate: initClientCertificate,
        privateKey: initPrivateKey,
        caCertificates: initCaCertificates,
        addLoadBalancer: initLoadBalancer !== undefined,
        simpleLB: initLoadBalancer !== undefined && initLoadBalancer.simple !== undefined,
        consistentHashType: initConsistentHashType,
        loadBalancer: initLoadBalancer
          ? initLoadBalancer
          : {
              simple: ROUND_ROBIN
            },
        peerAuthnSelector: {
          addPeerAuthentication: initPeerAuthentication !== undefined,
          addPeerAuthnModified: false,
          mode: initPeerAuthentication || PeerAuthenticationMutualTLSMode.UNSET
        },
        addConnectionPool: initConnetionPool ? true : false,
        connectionPool: initConnetionPool
          ? initConnetionPool
          : {
              tcp: {
                maxConnections: 1
              },
              http: {
                http1MaxPendingRequests: 1
              }
            },
        addOutlierDetection: initOutlierDetection ? true : false,
        outlierDetection: initOutlierDetection
          ? initOutlierDetection
          : {
              consecutiveErrors: 1
            }
      };
      const gateway: GatewaySelectorState = {
        addGateway: false,
        gwHosts: '',
        gwHostsValid: false,
        newGateway: false,
        selectedGateway: '',
        addMesh: false,
        port: 80
      };
      const k8sGateway: K8sGatewaySelectorState = {
        addGateway: false,
        gwHosts: '',
        gwHostsValid: false,
        newGateway: false,
        selectedGateway: '',
        addMesh: false,
        port: 80
      };
      if (hasGateway(this.props.virtualServices)) {
        const [gatewaySelected, isMesh] = getInitGateway(this.props.virtualServices);
        gateway.addGateway = true;
        gateway.selectedGateway = gatewaySelected;
        gateway.addMesh = isMesh;
      }
      if (hasK8sGateway(this.props.k8sHTTPRoutes)) {
        const gatewaySelected = getInitK8sGateway(this.props.k8sHTTPRoutes);
        k8sGateway.addGateway = true;
        k8sGateway.selectedGateway = gatewaySelected;
      }
      this.setState({
        showWizard: this.props.show,
        showPreview: false,
        workloads: [],
        rules: [],
        k8sRules: [],
        valid: {
          mainWizard: isMainWizardValid,
          vsHosts: true,
          k8sRouteHosts: true,
          tls: true,
          lb: true,
          gateway: true,
          cp: true,
          od: true
        },
        vsHosts:
          initVsHosts.length > 1 || (initVsHosts.length === 1 && initVsHosts[0].length > 0)
            ? initVsHosts
            : [fqdnServiceName(this.props.serviceName, this.props.namespace)],
        k8sRouteHosts:
          initK8sRoutes.length > 1 || (initK8sRoutes.length === 1 && initK8sRoutes[0].length > 0)
            ? initK8sRoutes
            : [fqdnServiceName(this.props.serviceName, this.props.namespace)],
        trafficPolicy: trafficPolicy,
        gateway: gateway,
        k8sGateway: k8sGateway
      });
    }
  }

  compareWorkloads = (prev: WorkloadOverview[], current: WorkloadOverview[]): boolean => {
    if (prev.length !== current.length) {
      return false;
    }
    for (let i = 0; i < prev.length; i++) {
      if (!current.some(w => _.isEqual(w, prev[i]))) {
        return false;
      }
    }
    return true;
  };

  onClose = (changed: boolean) => {
    this.setState(emptyServiceWizardState(fqdnServiceName(this.props.serviceName, this.props.namespace)));
    this.props.onClose(changed);
  };

  onCreateUpdate = () => {
    const promises: Promise<Response<string>>[] = [];
    switch (this.props.type) {
      case WIZARD_TRAFFIC_SHIFTING:
      case WIZARD_TCP_TRAFFIC_SHIFTING:
      case WIZARD_K8S_REQUEST_ROUTING:
      case WIZARD_REQUEST_ROUTING:
      case WIZARD_FAULT_INJECTION:
      case WIZARD_REQUEST_TIMEOUTS:
        const dr = this.state.previews!.dr;
        const vs = this.state.previews!.vs;
        const gw = this.state.previews!.gw;
        const k8sgateway = this.state.previews!.k8sgateway;
        const k8shttproute = this.state.previews!.k8shttproute;
        const pa = this.state.previews!.pa;
        // Gateway is only created when user has explicit selected this option
        if (gw) {
          promises.push(
            API.createIstioConfigDetail(this.props.namespace, 'gateways', JSON.stringify(gw), this.props.cluster)
          );
        }
        if (k8sgateway) {
          promises.push(
            API.createIstioConfigDetail(
              this.props.namespace,
              'k8sgateways',
              JSON.stringify(k8sgateway),
              this.props.cluster
            )
          );
        }

        if (this.props.update) {
          if (dr) {
            promises.push(
              API.updateIstioConfigDetail(
                this.props.namespace,
                'destinationrules',
                dr.metadata.name,
                JSON.stringify(dr),
                this.props.cluster
              )
            );
          }
          if (vs) {
            promises.push(
              API.updateIstioConfigDetail(
                this.props.namespace,
                'virtualservices',
                vs.metadata.name,
                JSON.stringify(vs),
                this.props.cluster
              )
            );
          }
          if (k8shttproute) {
            promises.push(
              API.updateIstioConfigDetail(
                this.props.namespace,
                'k8shttproutes',
                k8shttproute.metadata.name,
                JSON.stringify(k8shttproute),
                this.props.cluster
              )
            );
          }

          if (dr) {
            this.handlePeerAuthnUpdate(pa, dr, promises);
          }
          // Note that Gateways are not updated from the Wizard, only the VS hosts/gateways sections are updated
        } else {
          if (dr) {
            promises.push(
              API.createIstioConfigDetail(
                this.props.namespace,
                'destinationrules',
                JSON.stringify(dr),
                this.props.cluster
              )
            );
          }
          if (vs) {
            promises.push(
              API.createIstioConfigDetail(
                this.props.namespace,
                'virtualservices',
                JSON.stringify(vs),
                this.props.cluster
              )
            );
          }
          if (k8shttproute) {
            promises.push(
              API.createIstioConfigDetail(
                this.props.namespace,
                'k8shttproutes',
                JSON.stringify(k8shttproute),
                this.props.cluster
              )
            );
          }

          if (pa) {
            promises.push(
              API.createIstioConfigDetail(
                this.props.namespace,
                'peerauthentications',
                JSON.stringify(pa),
                this.props.cluster
              )
            );
          }
        }
        break;
      default:
    }
    // Disable button before promise is completed. Then Wizard is closed.
    this.setState(prevState => {
      prevState.valid.mainWizard = false;
      return {
        valid: prevState.valid
      };
    });
    Promise.all(promises)
      .then(results => {
        if (results.length > 0) {
          AlertUtils.add(
            'Istio Config ' +
              (this.props.update ? 'updated' : 'created') +
              ' for ' +
              this.props.serviceName +
              ' service.',
            'default',
            MessageType.SUCCESS
          );
        }
        this.onClose(true);
      })
      .catch(error => {
        AlertUtils.addError('Could not ' + (this.props.update ? 'update' : 'create') + ' Istio config objects.', error);
        this.onClose(true);
      });
  };

  handlePeerAuthnUpdate = (
    pa: PeerAuthentication | undefined,
    dr: DestinationRule,
    promises: Promise<Response<string>>[]
  ): void => {
    if (pa) {
      if (this.state.trafficPolicy.peerAuthnSelector.addPeerAuthnModified) {
        promises.push(
          API.createIstioConfigDetail(
            this.props.namespace,
            'peerauthentications',
            JSON.stringify(pa),
            this.props.cluster
          )
        );
      } else {
        promises.push(
          API.updateIstioConfigDetail(
            this.props.namespace,
            'peerauthentications',
            dr.metadata.name,
            JSON.stringify(pa),
            this.props.cluster
          )
        );
      }
    } else if (this.state.trafficPolicy.peerAuthnSelector.addPeerAuthnModified) {
      promises.push(
        API.deleteIstioConfigDetail(this.props.namespace, 'peerauthentications', dr.metadata.name, this.props.cluster)
      );
    }
  };

  onVsHosts = (valid: boolean, vsHosts: string[]) => {
    this.setState(prevState => {
      prevState.valid.vsHosts = valid;
      if (prevState.gateway && prevState.gateway.addGateway && prevState.gateway.newGateway) {
        prevState.gateway.gwHosts = vsHosts.join(',');
      }
      // Check if Gateway is valid after a VsHosts check
      if (valid && !prevState.valid.gateway) {
        const hasVsWildcard = vsHosts.some(h => h === '*');
        if (hasVsWildcard) {
          if (prevState.gateway && !prevState.gateway.addMesh) {
            prevState.valid.gateway = true;
          }
        } else {
          // If no wildcard Gateway should be ok
          prevState.valid.gateway = true;
        }
      }
      return {
        valid: prevState.valid,
        vsHosts: vsHosts
      };
    });
  };

  onK8sRouteHosts = (valid: boolean, k8sRouteHosts: string[]) => {
    this.setState(prevState => {
      prevState.valid.k8sRouteHosts = valid;
      if (prevState.k8sGateway && prevState.k8sGateway.addGateway && prevState.k8sGateway.newGateway) {
        prevState.k8sGateway.gwHosts = k8sRouteHosts.join(',');
      }
      return {
        valid: prevState.valid,
        k8sRouteHosts: k8sRouteHosts
      };
    });
  };

  onTrafficPolicy = (valid: boolean, trafficPolicy: TrafficPolicyState) => {
    this.setState(prevState => {
      // At the moment this callback only updates the valid of the loadbalancer
      // tls is always true, but I maintain it on the structure for consistency
      prevState.valid.tls = valid;
      prevState.valid.lb = valid;
      return {
        valid: prevState.valid,
        trafficPolicy: trafficPolicy
      };
    });
  };

  onCircuitBreaker = (circuitBreaker: CircuitBreakerState) => {
    this.setState(prevState => {
      prevState.valid.cp = circuitBreaker.isValidConnectionPool;
      prevState.valid.od = circuitBreaker.isValidOutlierDetection;
      prevState.trafficPolicy.addConnectionPool = circuitBreaker.addConnectionPool;
      prevState.trafficPolicy.connectionPool = circuitBreaker.connectionPool;
      prevState.trafficPolicy.addOutlierDetection = circuitBreaker.addOutlierDetection;
      prevState.trafficPolicy.outlierDetection = circuitBreaker.outlierDetection;
      return {
        valid: prevState.valid,
        trafficPolicy: prevState.trafficPolicy
      };
    });
  };

  onGateway = (valid: boolean, gateway: GatewaySelectorState) => {
    this.setState(prevState => {
      prevState.valid.gateway = valid;
      return {
        valid: prevState.valid,
        gateway: gateway,
        vsHosts:
          gateway.addGateway && gateway.newGateway && gateway.gwHosts.length > 0
            ? gateway.gwHosts.split(',')
            : prevState.vsHosts
      };
    });
  };

  onK8sGateway = (valid: boolean, gateway: K8sGatewaySelectorState) => {
    this.setState(prevState => {
      prevState.valid.gateway = valid;
      return {
        valid: prevState.valid,
        k8sGateway: gateway,
        k8sRouteHosts:
          gateway.addGateway && gateway.newGateway && gateway.gwHosts.length > 0
            ? gateway.gwHosts.split(',')
            : prevState.k8sRouteHosts
      };
    });
  };

  onWeightsChange = (valid: boolean, workloads: WorkloadWeight[]) => {
    this.setState(prevState => {
      prevState.valid.mainWizard = valid;
      return {
        valid: prevState.valid,
        workloads: workloads
      };
    });
  };

  onRulesChange = (valid: boolean, rules: Rule[]) => {
    this.setState(prevState => {
      prevState.valid.mainWizard = valid;
      return {
        valid: prevState.valid,
        rules: rules
      };
    });
  };

  onK8sRulesChange = (valid: boolean, k8sRules: K8sRule[]) => {
    this.setState(prevState => {
      prevState.valid.mainWizard = valid;
      return {
        valid: prevState.valid,
        k8sRules: k8sRules
      };
    });
  };

  onFaultInjectionRouteChange = (valid: boolean, faultInjectionRoute: FaultInjectionRoute) => {
    this.setState(prevState => {
      prevState.valid.mainWizard = valid;
      return {
        valid: prevState.valid,
        faultInjectionRoute: faultInjectionRoute
      };
    });
  };

  onTimeoutRetryRouteChange = (valid: boolean, timeoutRetryRoute: TimeoutRetryRoute) => {
    this.setState(prevState => {
      prevState.valid.mainWizard = valid;
      return {
        valid: prevState.valid,
        timeoutRetryRoute: timeoutRetryRoute
      };
    });
  };

  isValid = (state: ServiceWizardState): boolean => {
    return (
      state.valid.mainWizard &&
      state.valid.vsHosts &&
      state.valid.tls &&
      state.valid.lb &&
      state.valid.gateway &&
      state.valid.cp &&
      state.valid.od
    );
  };

  isK8sAPIValid = (state: ServiceWizardState): boolean => {
    return state.valid.mainWizard && state.valid.k8sRouteHosts && state.valid.gateway;
  };

  advancedHandleTabClick = (_event, tabIndex) => {
    this.setState({
      advancedTabKey: tabIndex
    });
  };

  onPreview = () => {
    this.setState(
      {
        previews: buildIstioConfig(this.props, this.state)
      },
      () => this.setState({ showPreview: true })
    );
  };

  onConfirmPreview = (items: ConfigPreviewItem[]) => {
    const dr = items.filter(it => it.type === 'destinationrule')[0];
    const gw = items.filter(it => it.type === 'gateway')[0];
    const k8sgateway = items.filter(it => it.type === 'k8sgateway')[0];
    const pa = items.filter(it => it.type === 'peerauthentications')[0];
    const vs = items.filter(it => it.type === 'virtualservice')[0];
    const k8shttproute = items.filter(it => it.type === 'k8shttproute')[0];
    const previews: WizardPreviews = {
      dr: dr ? (dr.items[0] as DestinationRule) : undefined,
      gw: gw ? (gw.items[0] as Gateway) : undefined,
      k8sgateway: k8sgateway ? (k8sgateway.items[0] as K8sGateway) : undefined,
      pa: pa ? (pa.items[0] as PeerAuthentication) : undefined,
      vs: vs ? (vs.items[0] as VirtualService) : undefined,
      k8shttproute: k8shttproute ? (k8shttproute.items[0] as K8sHTTPRoute) : undefined
    };
    this.setState({ previews, showPreview: false, showWizard: false, confirmationModal: true });
  };

  getItems = () => {
    const items: ConfigPreviewItem[] = [];
    if (this.state.previews) {
      if (this.state.previews.dr) {
        items.push({ type: 'destinationrule', items: [this.state.previews.dr], title: 'Destination Rule' });
      }
      if (this.state.previews.gw) {
        items.push({ type: 'gateway', items: [this.state.previews.gw], title: 'Gateway' });
      }
      if (this.state.previews.k8sgateway) {
        items.push({ type: 'k8sgateway', items: [this.state.previews.k8sgateway], title: 'K8s Gateway' });
      }
      if (this.state.previews.k8shttproute) {
        items.push({ type: 'k8shttproute', items: [this.state.previews.k8shttproute], title: 'K8s HTTPRoute' });
      }
      if (this.state.previews.pa) {
        items.push({ type: 'peerauthentications', items: [this.state.previews.pa], title: 'Peer Authentication' });
      }
      if (this.state.previews.vs) {
        items.push({ type: 'virtualservice', items: [this.state.previews.vs], title: 'VirtualService' });
      }
    }
    return items;
  };

  render() {
    const [gatewaySelected, isMesh] = getInitGateway(this.props.virtualServices);
    const k8sGatewaySelected = getInitK8sGateway(this.props.k8sHTTPRoutes);
    const titleAction =
      this.props.type.length > 0
        ? this.props.update
          ? 'Update ' + WIZARD_TITLES[this.props.type]
          : 'Create ' + WIZARD_TITLES[this.props.type]
        : 'View Modal';
    const titleModal =
      this.props.type.length > 0
        ? this.props.update
          ? 'Update ' + WIZARD_TITLES[this.props.type]
          : 'Create ' + WIZARD_TITLES[this.props.type]
        : 'View Modal';
    return (
      <>
        <Modal
          variant={ModalVariant.small}
          title={titleAction}
          isOpen={this.state.confirmationModal}
          onClose={() => this.onClose(false)}
          actions={[
            <Button
              key="confirm"
              variant={ButtonVariant.primary}
              onClick={this.onCreateUpdate}
              data-test={'confirm-' + (this.props.update ? 'update' : 'create')}
            >
              {this.props.update ? 'Update' : 'Create'}
            </Button>,
            <Button key="cancel" variant={ButtonVariant.secondary} onClick={() => this.onClose(false)}>
              Cancel
            </Button>
          ]}
        >
          <>
            You're going to {this.props.update ? 'update' : 'create'} istio objects in Namespace {this.props.namespace}.
            Are you sure?
          </>
        </Modal>
        <Modal
          width={'75%'}
          title={titleModal}
          aria-label={titleModal}
          data-test={this.props.type + '_modal'}
          isOpen={this.state.showWizard}
          onClose={() => this.onClose(false)}
          onKeyPress={e => {
            if (e.key === 'Enter' && this.isValid(this.state)) {
              this.onPreview();
            }
          }}
          actions={[
            <Button
              isDisabled={!(this.isValid(this.state) || this.isK8sAPIValid(this.state))}
              key="confirm"
              variant={ButtonVariant.primary}
              onClick={this.onPreview}
              data-test="preview"
            >
              Preview
            </Button>,
            <Button key="cancel" variant={ButtonVariant.secondary} onClick={() => this.onClose(false)}>
              Cancel
            </Button>
          ]}
        >
          <IstioConfigPreview
            isOpen={this.state.showPreview}
            title={titleAction}
            ns={this.props.namespace}
            opTarget={this.props.update ? 'update' : 'create'}
            disableAction={!this.props.createOrUpdate}
            items={this.getItems()}
            onClose={() => this.setState({ showPreview: false })}
            onConfirm={(items: ConfigPreviewItem[]) => {
              this.onConfirmPreview(items);
            }}
          />
          {!this.props.istioAPIEnabled && (
            <div style={{ padding: ' 0 0 20px 0' }}>
              <KialiIcon.Warning /> <b>Istio API is disabled.</b> Be careful when editing the configuration as the Istio
              config validations are disabled when the Istio API is disabled.
            </div>
          )}
          {this.props.type === WIZARD_REQUEST_ROUTING && (
            <RequestRouting
              serviceName={this.props.serviceName}
              workloads={this.props.workloads}
              initRules={getInitRules(this.props.workloads, this.props.virtualServices, this.props.destinationRules)}
              onChange={this.onRulesChange}
            />
          )}
          {this.props.type === WIZARD_K8S_REQUEST_ROUTING && (
            <K8sRequestRouting
              subServices={this.props.subServices}
              initRules={getInitK8sRules(this.props.k8sHTTPRoutes)}
              onChange={this.onK8sRulesChange}
            />
          )}
          {this.props.type === WIZARD_FAULT_INJECTION && (
            <FaultInjection
              initFaultInjectionRoute={getInitFaultInjectionRoute(
                this.props.workloads,
                this.props.virtualServices,
                this.props.destinationRules
              )}
              onChange={this.onFaultInjectionRouteChange}
            />
          )}
          {(this.props.type === WIZARD_TRAFFIC_SHIFTING || this.props.type === WIZARD_TCP_TRAFFIC_SHIFTING) && (
            <TrafficShifting
              showValid={true}
              workloads={this.props.workloads}
              initWeights={getInitWeights(
                this.props.workloads,
                this.props.virtualServices,
                this.props.destinationRules
              )}
              showMirror={this.props.type === WIZARD_TRAFFIC_SHIFTING}
              onChange={this.onWeightsChange}
            />
          )}
          {this.props.type === WIZARD_REQUEST_TIMEOUTS && (
            <RequestTimeouts
              initTimeoutRetry={getInitTimeoutRetryRoute(
                this.props.workloads,
                this.props.virtualServices,
                this.props.destinationRules
              )}
              onChange={this.onTimeoutRetryRouteChange}
            />
          )}
          {(this.props.type === WIZARD_REQUEST_ROUTING ||
            this.props.type === WIZARD_FAULT_INJECTION ||
            this.props.type === WIZARD_TRAFFIC_SHIFTING ||
            this.props.type === WIZARD_TCP_TRAFFIC_SHIFTING ||
            this.props.type === WIZARD_REQUEST_TIMEOUTS) && (
            <ExpandableSection
              className={advancedOptionsStyle}
              isExpanded={this.state.showAdvanced}
              toggleText={(this.state.showAdvanced ? 'Hide' : 'Show') + ' Advanced Options'}
              contentId={(this.state.showAdvanced ? 'hide' : 'show') + '_advanced_options'}
              onToggle={() => {
                this.setState({
                  showAdvanced: !this.state.showAdvanced
                });
              }}
            >
              <Tabs isFilled={true} activeKey={this.state.advancedTabKey} onSelect={this.advancedHandleTabClick}>
                <Tab eventKey={0} title={'Destination Hosts'}>
                  <div style={{ marginTop: '20px' }}>
                    <VirtualServiceHosts
                      vsHosts={this.state.vsHosts}
                      gateway={this.state.gateway}
                      onVsHostsChange={this.onVsHosts}
                    />
                  </div>
                </Tab>
                <Tab eventKey={1} title={'Gateways'} data-test={'Gateways'}>
                  <div style={{ marginTop: '20px', marginBottom: '10px' }}>
                    <GatewaySelector
                      serviceName={this.props.serviceName}
                      hasGateway={hasGateway(this.props.virtualServices)}
                      gateway={gatewaySelected}
                      isMesh={isMesh}
                      gateways={this.props.gateways}
                      vsHosts={this.state.vsHosts}
                      onGatewayChange={this.onGateway}
                    />
                  </div>
                </Tab>
                <Tab eventKey={2} title={'Traffic Policy'}>
                  <div style={{ marginTop: '20px', marginBottom: '10px' }}>
                    <TrafficPolicy
                      mtlsMode={this.state.trafficPolicy.mtlsMode}
                      clientCertificate={this.state.trafficPolicy.clientCertificate}
                      privateKey={this.state.trafficPolicy.privateKey}
                      caCertificates={this.state.trafficPolicy.caCertificates}
                      hasLoadBalancer={this.state.trafficPolicy.addLoadBalancer}
                      loadBalancer={this.state.trafficPolicy.loadBalancer}
                      nsWideStatus={this.props.tlsStatus}
                      hasPeerAuthentication={this.state.trafficPolicy.peerAuthnSelector.addPeerAuthentication}
                      peerAuthenticationMode={this.state.trafficPolicy.peerAuthnSelector.mode}
                      addConnectionPool={this.state.trafficPolicy.addConnectionPool}
                      connectionPool={this.state.trafficPolicy.connectionPool}
                      addOutlierDetection={this.state.trafficPolicy.addOutlierDetection}
                      outlierDetection={this.state.trafficPolicy.outlierDetection}
                      onTrafficPolicyChange={this.onTrafficPolicy}
                    />
                  </div>
                </Tab>
                {this.props.type !== WIZARD_TCP_TRAFFIC_SHIFTING && (
                  <Tab eventKey={3} title={'Circuit Breaker'}>
                    <div style={{ marginTop: '20px', marginBottom: '10px' }}>
                      <CircuitBreaker
                        hasConnectionPool={this.state.trafficPolicy.addConnectionPool}
                        connectionPool={this.state.trafficPolicy.connectionPool}
                        hasOutlierDetection={this.state.trafficPolicy.addOutlierDetection}
                        outlierDetection={this.state.trafficPolicy.outlierDetection}
                        onCircuitBreakerChange={this.onCircuitBreaker}
                      />
                    </div>
                  </Tab>
                )}
              </Tabs>
            </ExpandableSection>
          )}
          {this.props.type === WIZARD_K8S_REQUEST_ROUTING && (
            <ExpandableSection
              className={advancedOptionsStyle}
              isExpanded={this.state.showAdvanced}
              toggleText={(this.state.showAdvanced ? 'Hide' : 'Show') + ' Advanced Options'}
              contentId={(this.state.showAdvanced ? 'hide' : 'show') + '_advanced_options'}
              onToggle={() => {
                this.setState({
                  showAdvanced: !this.state.showAdvanced
                });
              }}
            >
              <Tabs isFilled={true} activeKey={this.state.advancedTabKey} onSelect={this.advancedHandleTabClick}>
                <Tab eventKey={0} title={'K8s HTTPRoute Hosts'}>
                  <div style={{ marginTop: '20px' }}>
                    <K8sRouteHosts
                      valid={this.state.valid.k8sRouteHosts}
                      k8sRouteHosts={this.state.k8sRouteHosts}
                      gateway={this.state.gateway}
                      onK8sRouteHostsChange={this.onK8sRouteHosts}
                    />
                  </div>
                </Tab>
                <Tab eventKey={1} title={'K8s Gateways'} data-test={'K8s Gateways'}>
                  <div style={{ marginTop: '20px', marginBottom: '10px' }}>
                    <K8sGatewaySelector
                      serviceName={this.props.serviceName}
                      hasGateway={hasK8sGateway(this.props.k8sHTTPRoutes)}
                      gateway={k8sGatewaySelected}
                      k8sGateways={this.props.k8sGateways}
                      k8sRouteHosts={this.state.k8sRouteHosts}
                      onGatewayChange={this.onK8sGateway}
                    />
                  </div>
                </Tab>
              </Tabs>
            </ExpandableSection>
          )}
        </Modal>
      </>
    );
  }
}
