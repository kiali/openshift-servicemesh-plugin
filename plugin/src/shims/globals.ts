// Provides the Timer type used by legacy kiali vendor code that imports from 'globals'.
// The globals npm package dropped TypeScript type exports in v14+; this shim keeps
// the import working without requiring changes to the vendored kiali source.
export type Timer = ReturnType<typeof setInterval>;
