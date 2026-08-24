// OpenShift Console installs a page-wide MonacoEnvironment.getWorkerUrl for its
// native YAML editor. Relative worker filenames then resolve against this
// plugin's webpack publicPath (/api/plugins/ossmconsole/worker-yaml.js) and 404,
// which also fails Cypress as an uncaught worker exception.
//
// OSSMC 2.27 still uses ACE, not Monaco. Override getWorker so Console (and any
// PatternFly Monaco) uses a worker we actually ship, instead of inheriting
// Console's relative worker-yaml.js URL.
self.MonacoEnvironment = {
  getWorker: (): Worker =>
    new Worker(new URL('monaco-editor/esm/vs/editor/editor.worker.js', import.meta.url), { type: 'module' })
};
