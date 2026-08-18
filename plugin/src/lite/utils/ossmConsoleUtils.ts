import { k8sPatch } from '@openshift-console/dynamic-plugin-sdk';
import { ossmConsoleModel } from 'openshift/types/ossmconsole';
import type { OssmConsoleResource } from 'openshift/types/ossmconsole';
import type { LiteOssmConsoleResource } from '../types/ossmconsole';

export { findActiveOssmConsole } from 'openshift/utils/ossmConsoleUtils';

// The internal port Kiali listens on for its API. This is the port OSSM Console proxies to once
// connected, independent of whatever externally-facing route port a given Kiali installation uses.
export const KIALI_PORT = 20001;

export function isPromoted(
  ossmconsole: LiteOssmConsoleResource | null,
  serviceName: string,
  serviceNamespace: string
): boolean {
  const kiali = ossmconsole?.status?.kiali;
  return !!kiali?.available && kiali.serviceName === serviceName && kiali.serviceNamespace === serviceNamespace;
}

// Returns why the Connect/Disconnect action cannot be used right now, or null if it is usable.
// ossmConsoleStatusUnknown takes priority over the other checks since, when true, we genuinely
// cannot tell whether any Kiali is connected or not (as opposed to confidently knowing nothing is).
// serviceName/serviceNamespace are only checked for Connect (pass them only on the Connect path).
export function getActionUnavailableReason(
  t: (key: string) => string,
  ossmConsoleStatusUnknown: boolean,
  activeOssmConsole: LiteOssmConsoleResource | null,
  canPatchOssmConsole: boolean,
  serviceName?: string,
  serviceNamespace?: string
): string | null {
  if (ossmConsoleStatusUnknown) {
    return t('Unable to determine Console integration status: insufficient permissions to view OSSMConsole resources.');
  }
  if (!activeOssmConsole) {
    return t('No OSSMConsole resource was found on this cluster.');
  }
  if (!canPatchOssmConsole) {
    return t('You do not have permission to connect or disconnect Kiali installations from Console.');
  }
  if (serviceName !== undefined && serviceNamespace !== undefined) {
    if (!serviceName.trim() || !serviceNamespace.trim()) {
      return t('Cannot connect: Kiali service name or namespace is not configured.');
    }
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
    resource: ossmconsole as OssmConsoleResource
  });
}

// Disabling auto-discovery while leaving all three service settings empty is the only combination
// that deterministically forces installation without Kiali integration -- simply clearing the service settings is not enough,
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
    resource: ossmconsole as OssmConsoleResource
  });
}
