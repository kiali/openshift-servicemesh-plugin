import { rs } from '@rstest/core';

export const consoleFetchJSON = rs.fn();
export const useActivePerspective = rs.fn(() => ['admin', rs.fn()]);
export const getGroupVersionKindForResource = rs.fn();
