import * as React from 'react';
import { rs } from '@rstest/core';

export const consoleFetchJSON = rs.fn();
export const useActivePerspective = rs.fn(() => ['admin', rs.fn()]);
export const getGroupVersionKindForResource = rs.fn();
export const useK8sWatchResources = rs.fn(() => ({}));
export const ResourceLink: React.FC<Record<string, unknown>> = ({ name }) =>
  React.createElement('span', null, name as string);
export const Timestamp: React.FC<Record<string, unknown>> = ({ timestamp }) =>
  React.createElement('span', null, timestamp as string);
