import { resolveIstiodDeploymentName } from '../relatedResourceUtils';

describe('relatedResourceUtils', () => {
  it('uses istiod for default revision', () => {
    expect(resolveIstiodDeploymentName('default')).toBe('istiod');
    expect(resolveIstiodDeploymentName(undefined)).toBe('istiod');
  });

  it('uses istiod-{revision} for named revisions', () => {
    expect(resolveIstiodDeploymentName('v1-26-0')).toBe('istiod-v1-26-0');
  });
});
