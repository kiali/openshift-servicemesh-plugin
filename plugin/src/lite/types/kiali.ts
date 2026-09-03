import type { K8sGroupVersionKind, K8sModel, K8sResourceCommon } from '@openshift-console/dynamic-plugin-sdk';

export const kialiGVK: K8sGroupVersionKind = {
  group: 'kiali.io',
  kind: 'Kiali',
  version: 'v1alpha1'
};

export const routeGVK: K8sGroupVersionKind = {
  group: 'route.openshift.io',
  kind: 'Route',
  version: 'v1'
};

export const routeModel: K8sModel = {
  abbr: 'RT',
  apiGroup: 'route.openshift.io',
  apiVersion: 'v1',
  kind: 'Route',
  label: 'Route',
  labelPlural: 'Routes',
  namespaced: true,
  plural: 'routes'
};

export interface Route extends K8sResourceCommon {
  spec?: {
    host?: string;
  };
}

export interface LiteKialiResource extends K8sResourceCommon {
  spec?: {
    auth?: { strategy?: string };
    clustering?: {
      autodetect_secrets?: { enabled?: boolean; label?: string };
      clusters?: Array<{ name?: string; secret_name?: string }>;
    };
    deployment?: {
      cluster_wide_access?: boolean;
      ingress?: { enabled?: boolean };
      instance_name?: string;
      namespace?: string;
      replicas?: number;
      view_only_mode?: boolean;
    };
    external_services?: {
      grafana?: { enabled?: boolean; url?: string };
      istio?: { root_namespace?: string };
      prometheus?: { url?: string };
      tracing?: { enabled?: boolean; provider?: string; url?: string };
    };
    installation_tag?: string;
    server?: { port?: number; require_auth?: boolean; web_fqdn?: string };
    version?: string;
  };
  status?: {
    conditions?: Array<{ message?: string; reason?: string; status?: string; type?: string }>;
    deployment?: { instanceName?: string; namespace?: string };
    environment?: {
      openshiftVersion?: string;
      operatorVersion?: string;
    };
    progress?: { duration?: string; message?: string };
  };
}
