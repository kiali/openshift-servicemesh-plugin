export function getMockTableRowKey(obj: unknown): string {
  if (typeof obj === 'object' && obj !== null) {
    const md = (obj as { metadata?: { name?: string; namespace?: string; uid?: string } }).metadata;
    if (md?.uid) return md.uid;
    if (md?.name) return `${md.namespace ?? ''}/${md.name}`;
  }
  return JSON.stringify(obj);
}
