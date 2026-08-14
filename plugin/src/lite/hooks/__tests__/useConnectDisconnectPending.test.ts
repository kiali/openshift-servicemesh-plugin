import { renderHook, act } from '@testing-library/react';
import { AlertVariant } from '@patternfly/react-core';
import { RECONCILIATION_TIMEOUT_MS, useConnectDisconnectPending } from '../useConnectDisconnectPending';

describe('useConnectDisconnectPending', () => {
  it('calls onTimeout and sets a danger alert when reconciliation does not complete in time', () => {
    const onTimeout = rs.fn();
    const setAlert = rs.fn();
    rs.useFakeTimers();
    try {
      renderHook(() =>
        useConnectDisconnectPending({
          isOperationComplete: false,
          isPending: true,
          onTimeout,
          setAlert,
          timeoutMessage: 'Timed out waiting for Console integration to update.'
        })
      );
      expect(onTimeout).not.toHaveBeenCalled();
      act(() => {
        rs.advanceTimersByTime(RECONCILIATION_TIMEOUT_MS);
      });
      expect(onTimeout).toHaveBeenCalledTimes(1);
      expect(setAlert).toHaveBeenCalledWith({
        message: 'Timed out waiting for Console integration to update.',
        variant: AlertVariant.danger
      });
    } finally {
      rs.useRealTimers();
    }
  });

  it('does not time out when the operation completes before the deadline', () => {
    const onTimeout = rs.fn();
    const setAlert = rs.fn();
    rs.useFakeTimers();
    try {
      const { rerender } = renderHook(
        ({ isOperationComplete, isPending }) =>
          useConnectDisconnectPending({
            isOperationComplete,
            isPending,
            onTimeout,
            setAlert,
            timeoutMessage: 'Timed out'
          }),
        { initialProps: { isOperationComplete: false, isPending: true } }
      );
      act(() => {
        rs.advanceTimersByTime(RECONCILIATION_TIMEOUT_MS / 2);
      });
      rerender({ isOperationComplete: true, isPending: false });
      act(() => {
        rs.advanceTimersByTime(RECONCILIATION_TIMEOUT_MS);
      });
      expect(onTimeout).not.toHaveBeenCalled();
      expect(setAlert).not.toHaveBeenCalled();
    } finally {
      rs.useRealTimers();
    }
  });
});
