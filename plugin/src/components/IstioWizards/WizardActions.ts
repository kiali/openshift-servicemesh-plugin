import {
  AuthorizationPolicy,
  DestService,
  GraphDefinition,
  KIALI_WIZARD_LABEL,
  NodeType,
  serverConfig,
  Sidecar
} from '@kiali/types';

// Wizard don't operate with EnvoyFilters so they can use the v1beta1 version
export const ISTIO_NETWORKING_VERSION = 'networking.istio.io/v1beta1';

export const buildGraphSidecars = (namespace: string, graph: GraphDefinition): Sidecar[] => {
  const sidecars: Sidecar[] = [];

  if (graph.elements.nodes) {
    for (let i = 0; i < graph.elements.nodes.length; i++) {
      const node = graph.elements.nodes[i];
      if (
        node.data.namespace === namespace &&
        node.data.nodeType === NodeType.WORKLOAD &&
        node.data.workload &&
        node.data.app &&
        node.data.version
      ) {
        const sc: Sidecar = {
          kind: 'Sidecar',
          apiVersion: ISTIO_NETWORKING_VERSION,
          metadata: {
            name: node.data.workload,
            namespace: namespace,
            labels: {
              [KIALI_WIZARD_LABEL]: 'Sidecar'
            }
          },
          spec: {
            workloadSelector: {
              labels: {
                app: node.data.app,
                version: node.data.version
              }
            },
            egress: [
              {
                hosts: [`${serverConfig.istioNamespace}/*`]
              }
            ]
          }
        };

        if (graph.elements.edges) {
          for (let j = 0; j < graph.elements.edges.length; j++) {
            const edge = graph.elements.edges[j];

            if (node.data.id === edge.data.source) {
              for (let z = 0; z < graph.elements.nodes.length; z++) {
                const targetNode = graph.elements.nodes[z];

                if (targetNode.data.id === edge.data.target) {
                  targetNode.data.destServices?.forEach((ds: DestService) => {
                    if (sc.spec.egress && ds.namespace !== 'unknown') {
                      sc.spec.egress[0].hosts.push(
                        `${ds.namespace}/${ds.name}.${ds.namespace}.${serverConfig.istioIdentityDomain}`
                      );
                    }
                  });
                }
              }
            }
          }
        }

        sidecars.push(sc);
      }
    }
  }

  return sidecars;
};

export const buildGraphAuthorizationPolicy = (namespace: string, graph: GraphDefinition): AuthorizationPolicy[] => {
  const denyAll: AuthorizationPolicy = {
    kind: 'AuthorizationPolicy',
    apiVersion: 'security.istio.io/v1beta1',
    metadata: {
      name: 'deny-all-' + namespace,
      namespace: namespace,
      labels: {
        [KIALI_WIZARD_LABEL]: 'AuthorizationPolicy'
      }
    },
    spec: {}
  };
  const aps: AuthorizationPolicy[] = [denyAll];

  if (graph.elements.nodes) {
    for (let i = 0; i < graph.elements.nodes.length; i++) {
      const node = graph.elements.nodes[i];
      if (
        node.data.namespace === namespace &&
        node.data.nodeType === NodeType.WORKLOAD &&
        node.data.workload &&
        node.data.app &&
        node.data.version
      ) {
        const ap: AuthorizationPolicy = {
          kind: 'AuthorizationPolicy',
          apiVersion: ISTIO_NETWORKING_VERSION,
          metadata: {
            name: node.data.workload,
            namespace: namespace,
            labels: {
              [KIALI_WIZARD_LABEL]: 'AuthorizationPolicy'
            }
          },
          spec: {
            selector: {
              matchLabels: {
                app: node.data.app,
                version: node.data.version
              }
            },
            rules: [
              {
                from: [
                  {
                    source: {
                      principals: []
                    }
                  }
                ]
              }
            ]
          }
        };
        let principalsLen = 0;
        if (graph.elements.edges) {
          for (let j = 0; j < graph.elements.edges.length; j++) {
            const edge = graph.elements.edges[j];
            if (node.data.id === edge.data.target) {
              if (
                ap.spec.rules &&
                ap.spec.rules[0] &&
                ap.spec.rules[0].from &&
                ap.spec.rules[0].from[0] &&
                ap.spec.rules[0].from[0].source &&
                ap.spec.rules[0].from[0].source.principals &&
                edge.data.sourcePrincipal
              ) {
                const principal = edge.data.sourcePrincipal.startsWith('spiffe://')
                  ? edge.data.sourcePrincipal.substring(9)
                  : edge.data.sourcePrincipal;
                ap.spec.rules[0].from[0].source.principals.push(principal);
                principalsLen++;
              }
            }
          }
        }
        if (principalsLen > 0) {
          aps.push(ap);
        }
      }
    }
  }
  return aps;
};

export const buildNamespaceInjectionPatch = (enable: boolean, remove: boolean, revision: string | null): string => {
  const labels = {};
  if (revision) {
    labels[serverConfig.istioLabels.injectionLabelName] = null;
    labels[serverConfig.istioLabels.injectionLabelRev] = revision;
  } else {
    labels[serverConfig.istioLabels.injectionLabelName] = remove ? null : enable ? 'enabled' : 'disabled';
    labels[serverConfig.istioLabels.injectionLabelRev] = null;
  }
  const patch = {
    metadata: {
      labels: labels
    }
  };
  return JSON.stringify(patch);
};
