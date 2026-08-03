import * as monaco from 'monaco-editor';
import 'monaco-editor/esm/vs/basic-languages/yaml/yaml.contribution';
import { loader } from '@monaco-editor/react';

// webpack.config.ts aliases 'monaco-editor' to the worker-free editor.api entry point, which
// keeps Monaco's web worker scripts out of the bundle. Without this, @monaco-editor/react
// fetches those worker scripts from cdn.jsdelivr.net at runtime, breaking the YAML editor in
// air-gapped/disconnected clusters and causing flaky Cypress failures when the CDN is
// unreachable. editor.api excludes basic-language contributions, so the YAML Monarch
// tokenizer is imported explicitly above to keep syntax highlighting working.
loader.config({ monaco });
