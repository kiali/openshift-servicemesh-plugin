import * as monaco from 'monaco-editor';
import 'monaco-editor/esm/vs/basic-languages/yaml/yaml.contribution';
import { loader } from '@monaco-editor/react';

// webpack.config.ts aliases 'monaco-editor' to editor.api.js so @monaco-editor/react loads the
// bundled monaco-editor instead of fetching it from cdn.jsdelivr.net at runtime. Without this,
// the YAML editor breaks in air-gapped/disconnected clusters and Cypress is flaky whenever the
// CDN is unreachable. editor.api ships without any basic-language grammar, so the YAML Monarch
// tokenizer is imported explicitly above to keep syntax highlighting working.
loader.config({ monaco });

// OpenShift Console bundles its own, separately versioned monaco-editor for its "Edit YAML"
// resource editor and, via monaco-editor-webpack-plugin's `globalAPI: true` option, sets a
// page-wide `window.MonacoEnvironment.getWorkerUrl`. Since our plugin runs in the same browser
// realm as Console, our editor instances would otherwise inherit Console's worker URL and speak
// an incompatible RPC protocol to a differently versioned worker script, surfacing as
// "Uncaught TypeError: e is not iterable" the first time a lazily-created worker is needed
// (e.g. link detection or word-based suggestions). Providing our own getWorker keeps OSSMC's
// Monaco instance self-contained regardless of what Console has set on the shared global.
self.MonacoEnvironment = {
  getWorker: () =>
    new Worker(new URL('monaco-editor/esm/vs/editor/editor.worker.js', import.meta.url), { type: 'module' })
};
