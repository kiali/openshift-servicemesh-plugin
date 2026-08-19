import { useEffect } from 'react';
import { AlertVariant } from '@patternfly/react-core';

export const RECONCILIATION_TIMEOUT_MS = 3 * 60 * 1000;

type ConnectDisconnectAlert = { message: string; variant: AlertVariant };

type UseConnectDisconnectPendingArgs = {
  isOperationComplete: boolean;
  isPending: boolean;
  onTimeout: () => void;
  setAlert: (alert: ConnectDisconnectAlert | null) => void;
  timeoutMessage: string;
};

// Clears a stuck Connect/Disconnect pending state when the OSSMConsole watch never reflects the PATCH.
export function useConnectDisconnectPending({
  isOperationComplete,
  isPending,
  onTimeout,
  setAlert,
  timeoutMessage
}: UseConnectDisconnectPendingArgs): void {
  useEffect(() => {
    if (!isPending || isOperationComplete) {
      return;
    }
    const timer = window.setTimeout(() => {
      onTimeout();
      setAlert({
        message: timeoutMessage,
        variant: AlertVariant.danger
      });
    }, RECONCILIATION_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [isOperationComplete, isPending, onTimeout, setAlert, timeoutMessage]);
}
