import { rs } from '@rstest/core';
import type { FC } from 'react';

// Exports that lite pages need from @openshift-console/dynamic-plugin-sdk
// that are not already covered by the fleet-mesh or openshift sibling mocks.
// The root plugin/src/__mocks__/consoleSdkMock.ts re-exports from all three.
//
// Already covered by fleet-mesh mock (do NOT re-export here):
//   useK8sWatchResource, Timestamp, and the VirtualizedTable family
// Already covered by openshift mock (do NOT re-export here):
//   consoleFetchJSON, useActivePerspective

export const ResourceLink: FC<{
  displayName?: string;
  groupVersionKind?: { kind?: string };
  kind?: string;
  name?: string;
  namespace?: string;
}> = ({ displayName, name }) => <span>{displayName ?? name ?? ''}</span>;

export const k8sPatch = rs.fn();

export const k8sList = rs.fn(() => Promise.resolve({ items: [] }));

// Defaults to rejecting so tests that don't care about Route discovery don't need to mock it;
// KialisPage treats a rejected Route lookup as "no Route found" and falls back gracefully.
export const k8sGet = rs.fn(() => Promise.reject(new Error('not mocked')));

// Defaults to "allowed" so existing tests that don't care about RBAC keep passing unless a
// test explicitly overrides it to exercise the disabled/tooltip states.
export const useAccessReview = rs.fn(() => [true, false]);
