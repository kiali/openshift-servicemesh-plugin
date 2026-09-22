import type { LiteKialiResource } from '../types/kiali';
import { getKialiServiceTarget } from './kialiServiceTarget';

/** Kialis whose deployment namespace matches the control plane namespace observe that control plane. */
export function findKialisForControlPlaneNamespace(
  kialis: LiteKialiResource[],
  controlPlaneNamespace: string | undefined
): LiteKialiResource[] {
  const namespace = controlPlaneNamespace?.trim();
  if (!namespace) {
    return [];
  }
  return kialis.filter(k => getKialiServiceTarget(k).namespace === namespace);
}
