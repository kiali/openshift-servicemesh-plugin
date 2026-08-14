import type { OssmConsoleResource } from '../types/ossmconsole';

// The operator only reconciles a single OSSMConsole CR per cluster (the oldest one; any others are
// ignored), so promote/demote must target that same CR or the change will have no effect.
export function findActiveOssmConsole(resources: OssmConsoleResource[]): OssmConsoleResource | null {
  if (resources.length === 0) return null;
  return resources.reduce((oldest, candidate) => {
    const oldestTime = oldest.metadata?.creationTimestamp ?? '';
    const candidateTime = candidate.metadata?.creationTimestamp ?? '';
    return candidateTime < oldestTime ? candidate : oldest;
  });
}

export function getKialiStatusProbeKey(ossmConsoles: OssmConsoleResource[] | undefined, loaded: boolean): string {
  if (!loaded || !Array.isArray(ossmConsoles)) {
    return 'loading';
  }
  const active = findActiveOssmConsole(ossmConsoles);
  const kiali = active?.status?.kiali;
  if (!kiali) {
    return 'none';
  }
  return `${kiali.available}-${kiali.serviceName}-${kiali.serviceNamespace}`;
}
