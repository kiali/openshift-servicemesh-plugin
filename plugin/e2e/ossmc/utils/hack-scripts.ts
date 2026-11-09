import { execSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';

// The plugin package is CommonJS; __dirname is available natively.
const REPO_ROOT = path.resolve(__dirname, '../../../..');

/**
 * Download the kiali istio hack scripts (into _output/kiali/hack/istio) unless
 * they are already present. The vendored demoApps util expects them there;
 * kiali has them at its repo root, OSSMC vendors them via this script.
 */
export function ensureKialiHackScripts(): void {
  if (existsSync(path.join(REPO_ROOT, '_output/kiali/hack/istio'))) {
    return;
  }
  execSync(path.join(REPO_ROOT, 'hack/download-hack-scripts.sh'), {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    timeout: 120_000
  });
}
