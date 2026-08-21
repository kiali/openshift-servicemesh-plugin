import type { K8sModel } from '@openshift-console/dynamic-plugin-sdk';

export const kialiDeploymentModel: K8sModel = {
  abbr: 'D',
  apiGroup: 'apps',
  apiVersion: 'v1',
  kind: 'Deployment',
  label: 'Deployment',
  labelPlural: 'Deployments',
  namespaced: true,
  plural: 'deployments'
};

export type KialiDeploymentLike = {
  spec?: {
    template?: {
      spec?: {
        containers?: Array<{
          image?: string;
          name?: string;
          volumeMounts?: Array<{ mountPath?: string; name?: string }>;
        }>;
        volumes?: Array<{
          name?: string;
          secret?: { optional?: boolean; secretName?: string };
        }>;
      };
    };
  };
};
