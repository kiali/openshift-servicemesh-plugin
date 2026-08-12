import { k8sPatch } from '@openshift-console/dynamic-plugin-sdk';
import { ossmConsoleModel } from '../types/ossmconsole';
import type { LiteOssmConsoleResource } from '../types/ossmconsole';

// The internal port Kiali listens on for its API. This is the port OSSM Console proxies to once
// promoted, independent of whatever externally-facing route port a given Kiali installation uses.
export const KIALI_PORT = 20001;

// The operator only reconciles a single OSSMConsole CR per cluster (the oldest one; any others are
// ignored), so promote/demote must target that same CR or the change will have no effect.
export function findActiveOssmConsole(resources: LiteOssmConsoleResource[]): LiteOssmConsoleResource | null {
  if (resources.length === 0) return null;
  return resources.reduce((oldest, candidate) => {
    const oldestTime = oldest.metadata?.creationTimestamp ?? '';
    const candidateTime = candidate.metadata?.creationTimestamp ?? '';
    return candidateTime < oldestTime ? candidate : oldest;
  });
}

export function isPromoted(
  ossmconsole: LiteOssmConsoleResource | null,
  serviceName: string,
  serviceNamespace: string
): boolean {
  const kiali = ossmconsole?.status?.kiali;
  return !!kiali?.available && kiali.serviceName === serviceName && kiali.serviceNamespace === serviceNamespace;
}

// Returns why the promote/demote action cannot be used right now, or null if it is usable.
// ossmConsoleStatusUnknown takes priority over the other checks since, when true, we genuinely
// cannot tell whether anything is promoted or not (as opposed to confidently knowing nothing is).
export function getActionUnavailableReason(
  t: (key: string) => string,
  ossmConsoleStatusUnknown: boolean,
  activeOssmConsole: LiteOssmConsoleResource | null,
  canPatchOssmConsole: boolean
): string | null {
  if (ossmConsoleStatusUnknown) {
    return t('Unable to determine Console integration status: insufficient permissions to view OSSMConsole resources.');
  }
  if (!activeOssmConsole) {
    return t('No OSSMConsole resource was found on this cluster.');
  }
  if (!canPatchOssmConsole) {
    return t('You do not have permission to change the promoted Kiali installation.');
  }
  return null;
}

// Resets kiali.autoDiscover to true so that if the fields are ever cleared again outside of this UI
// (e.g. by hand-editing the CR), the operator falls back to normal auto-discovery instead of staying
// silently stuck in the disabled-discovery state that demoteFromConsole below relies on.
export async function promoteToConsole(
  ossmconsole: LiteOssmConsoleResource,
  serviceName: string,
  serviceNamespace: string
): Promise<void> {
  await k8sPatch({
    data: [
      {
        op: 'add',
        path: '/spec/kiali',
        value: { autoDiscover: true, serviceName, serviceNamespace, servicePort: KIALI_PORT }
      }
    ],
    model: ossmConsoleModel,
    resource: ossmconsole
  });
}

// Disabling auto-discovery while leaving all three service settings empty is the only combination
// that deterministically forces lite mode -- simply clearing the service settings is not enough,
// since the operator would just auto-discover a different Kiali installation on the cluster.
export async function demoteFromConsole(ossmconsole: LiteOssmConsoleResource): Promise<void> {
  await k8sPatch({
    data: [
      {
        op: 'add',
        path: '/spec/kiali',
        value: { autoDiscover: false, serviceName: '', serviceNamespace: '', servicePort: 0 }
      }
    ],
    model: ossmConsoleModel,
    resource: ossmconsole
  });
}
