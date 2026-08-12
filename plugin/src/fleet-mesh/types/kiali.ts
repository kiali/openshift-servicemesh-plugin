import type { K8sGroupVersionKind, K8sModel, K8sResourceCommon } from '@openshift-console/dynamic-plugin-sdk';

export const kialiGroupVersionKind: K8sGroupVersionKind = {
  group: 'kiali.io',
  kind: 'Kiali',
  version: 'v1alpha1'
};

export const kialiModel: K8sModel = {
  abbr: 'KIALI',
  apiGroup: 'kiali.io',
  apiVersion: 'v1alpha1',
  kind: 'Kiali',
  label: 'Kiali',
  labelPlural: 'Kialis',
  namespaced: true,
  plural: 'kialis'
};

export const ossmConsoleGroupVersionKind: K8sGroupVersionKind = {
  group: 'kiali.io',
  kind: 'OSSMConsole',
  version: 'v1alpha1'
};

export const ossmConsoleModel: K8sModel = {
  abbr: 'OSSMC',
  apiGroup: 'kiali.io',
  apiVersion: 'v1alpha1',
  kind: 'OSSMConsole',
  label: 'OSSMConsole',
  labelPlural: 'OSSMConsoles',
  namespaced: true,
  plural: 'ossmconsoles'
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

export interface KialiCR extends K8sResourceCommon {
  spec?: {
    deployment?: {
      ingress?: { enabled?: boolean };
      instance_name?: string;
      namespace?: string;
    };
    server?: { web_fqdn?: string };
  };
}

export type FleetKialiCR = KialiCR & { cluster: string };

export interface OssmConsoleCR extends K8sResourceCommon {
  status?: {
    kiali?: {
      available?: boolean;
      serviceName?: string;
      serviceNamespace?: string;
      servicePort?: number | string;
    };
  };
}

export type FleetOssmConsoleCR = OssmConsoleCR & { cluster: string };

export interface Route extends K8sResourceCommon {
  spec?: {
    host?: string;
  };
}

export interface DiscoveredKiali {
  cluster: string;
  crName: string;
  crNamespace: string;
  deploymentNamespace: string;
  instanceName: string;
  routeHost?: string;
  webFqdn?: string;
}

export interface DiscoveredOssmc {
  cluster: string;
  crName: string;
  crNamespace: string;
  kialiServiceName?: string;
  kialiServiceNamespace?: string;
}

export interface KialiLink {
  cluster: string;
  controlPlaneNamespace: string;
  ossmcUrl?: string;
  standaloneUrl?: string;
}
