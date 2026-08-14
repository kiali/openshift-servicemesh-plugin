export function getMockTableRowKey(obj: unknown): string {
  if (typeof obj === 'object' && obj !== null) {
    const record = obj as {
      cluster?: string;
      clusterName?: string;
      metadata?: { name?: string; namespace?: string; uid?: string };
    };
    const cluster = record.clusterName ?? record.cluster;
    const md = record.metadata;
    if (md?.uid) return cluster ? `${cluster}/${md.uid}` : md.uid;
    if (cluster && md?.name) return `${cluster}/${md.name}`;
    if (md?.name) return `${md.namespace ?? ''}/${md.name}`;
  }
  return JSON.stringify(obj);
}
