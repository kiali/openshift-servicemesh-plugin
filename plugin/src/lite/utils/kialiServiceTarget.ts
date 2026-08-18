import type { LiteKialiResource } from '../types/kiali';

const DEFAULT_KIALI_INSTANCE_NAME = 'kiali';

// The Kiali CR's own name/namespace are not necessarily where the Kiali service runs --
// spec.deployment can point it elsewhere, so every consumer needs to resolve through here
// rather than reading metadata.name/namespace directly.
export function getKialiServiceTarget(resource: LiteKialiResource): { name: string; namespace: string } {
  const deployment = resource.spec?.deployment;
  const namespace = deployment?.namespace?.trim() || resource.metadata?.namespace?.trim() || '';
  const name = deployment?.instance_name?.trim() || resource.metadata?.name?.trim() || DEFAULT_KIALI_INSTANCE_NAME;
  return { name, namespace };
}
