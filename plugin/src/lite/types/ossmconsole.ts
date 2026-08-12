import type { K8sGroupVersionKind, K8sModel, K8sResourceCommon } from '@openshift-console/dynamic-plugin-sdk';

export const ossmConsoleGVK: K8sGroupVersionKind = {
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

export interface LiteOssmConsoleResource extends K8sResourceCommon {
  spec?: {
    kiali?: {
      autoDiscover?: boolean;
      serviceName?: string;
      serviceNamespace?: string;
      servicePort?: number;
    };
  };
  status?: {
    kiali?: {
      available?: boolean;
      serviceName?: string;
      serviceNamespace?: string;
      servicePort?: number | string;
    };
  };
}
