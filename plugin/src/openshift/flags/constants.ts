// Set from spec.internal.techPreview on the OSSMConsole CR (rendered into plugin-config.json by
// the operator). Off by default -- gates the unsupported tech preview features (OSSMC-Lite and
// Fleet Service Mesh) behind a single customer opt-in.
export const OSSMC_INTERNAL_TECH_PREVIEW_FLAG = 'OSSMC_INTERNAL_TECH_PREVIEW';
