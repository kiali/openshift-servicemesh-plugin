import { k8sPatch } from '@openshift-console/dynamic-plugin-sdk';
import { findActiveOssmConsole } from 'openshift/utils/ossmConsoleUtils';
import {
  KIALI_PORT,
  demoteFromConsole,
  getActionUnavailableReason,
  isPromoted,
  promoteToConsole
} from '../ossmConsoleUtils';
import { ossmConsoleModel } from '../../types/ossmconsole';
import { makeOssmConsoleResource } from '../../__fixtures__/testFactories';

afterEach(() => rstest.clearAllMocks());

describe('findActiveOssmConsole', () => {
  it('returns null when there are no resources', () => {
    expect(findActiveOssmConsole([])).toBeNull();
  });

  it('returns the only resource when there is exactly one', () => {
    const only = makeOssmConsoleResource();
    expect(findActiveOssmConsole([only])).toBe(only);
  });

  it('returns the resource with the oldest creationTimestamp, matching the operator "oldest CR wins" rule', () => {
    const older = makeOssmConsoleResource({
      metadata: { name: 'older', namespace: 'ossmconsole', creationTimestamp: '2026-01-01T00:00:00Z' }
    });
    const newer = makeOssmConsoleResource({
      metadata: { name: 'newer', namespace: 'ossmconsole', creationTimestamp: '2026-02-01T00:00:00Z' }
    });
    expect(findActiveOssmConsole([newer, older])).toBe(older);
    expect(findActiveOssmConsole([older, newer])).toBe(older);
  });
});

describe('isPromoted', () => {
  it('returns false when the OSSMConsole resource is null', () => {
    expect(isPromoted(null, 'kiali', 'istio-system')).toBe(false);
  });

  it('returns false when status.kiali.available is false', () => {
    const ossmconsole = makeOssmConsoleResource({
      status: { kiali: { available: false, serviceName: 'kiali', serviceNamespace: 'istio-system' } }
    });
    expect(isPromoted(ossmconsole, 'kiali', 'istio-system')).toBe(false);
  });

  it('returns false when available but the service name/namespace do not match', () => {
    const ossmconsole = makeOssmConsoleResource({
      status: { kiali: { available: true, serviceName: 'other', serviceNamespace: 'istio-system' } }
    });
    expect(isPromoted(ossmconsole, 'kiali', 'istio-system')).toBe(false);
  });

  it('returns true when available and the service name/namespace match', () => {
    const ossmconsole = makeOssmConsoleResource({
      status: { kiali: { available: true, serviceName: 'kiali', serviceNamespace: 'istio-system' } }
    });
    expect(isPromoted(ossmconsole, 'kiali', 'istio-system')).toBe(true);
  });
});

describe('promoteToConsole', () => {
  it('patches spec.kiali with autoDiscover true and the given service target', async () => {
    const ossmconsole = makeOssmConsoleResource();
    await promoteToConsole(ossmconsole, 'kiali', 'istio-system');
    expect(k8sPatch).toHaveBeenCalledWith({
      data: [
        {
          op: 'add',
          path: '/spec/kiali',
          value: { autoDiscover: true, serviceName: 'kiali', serviceNamespace: 'istio-system', servicePort: KIALI_PORT }
        }
      ],
      model: ossmConsoleModel,
      resource: ossmconsole
    });
  });
});

describe('demoteFromConsole', () => {
  it('patches spec.kiali with autoDiscover false and all service fields cleared', async () => {
    const ossmconsole = makeOssmConsoleResource();
    await demoteFromConsole(ossmconsole);
    expect(k8sPatch).toHaveBeenCalledWith({
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
  });
});

describe('getActionUnavailableReason', () => {
  const t = (key: string): string => key;

  it('returns a reason when the OSSMConsole status is unknown, regardless of other args', () => {
    expect(getActionUnavailableReason(t, true, makeOssmConsoleResource(), true)).not.toBeNull();
  });

  it('returns a reason when no active OSSMConsole resource was found', () => {
    expect(getActionUnavailableReason(t, false, null, true)).not.toBeNull();
  });

  it('returns a reason when the user cannot patch the OSSMConsole resource', () => {
    expect(getActionUnavailableReason(t, false, makeOssmConsoleResource(), false)).not.toBeNull();
  });

  it('returns null when the status is known, an OSSMConsole resource exists, and the user can patch it', () => {
    expect(getActionUnavailableReason(t, false, makeOssmConsoleResource(), true)).toBeNull();
  });

  it('returns a reason when the service target is incomplete for Connect', () => {
    expect(getActionUnavailableReason(t, false, makeOssmConsoleResource(), true, 'kiali', '')).not.toBeNull();
    expect(getActionUnavailableReason(t, false, makeOssmConsoleResource(), true, '', 'istio-system')).not.toBeNull();
  });

  it('does not check the service target when service args are omitted', () => {
    expect(getActionUnavailableReason(t, false, makeOssmConsoleResource(), true)).toBeNull();
  });
});
