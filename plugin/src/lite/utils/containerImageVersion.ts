/** Extracts the tag or digest identifier from a container image reference. */
export function parseContainerImageVersion(image: string | undefined): string | undefined {
  const trimmed = image?.trim();
  if (!trimmed) {
    return undefined;
  }
  const digestIndex = trimmed.lastIndexOf('@');
  if (digestIndex >= 0) {
    const digest = trimmed.slice(digestIndex + 1).trim();
    return digest || undefined;
  }
  const tagIndex = trimmed.lastIndexOf(':');
  if (tagIndex >= 0 && tagIndex > trimmed.lastIndexOf('/')) {
    const tag = trimmed.slice(tagIndex + 1).trim();
    return tag || undefined;
  }
  return undefined;
}
