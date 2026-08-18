// v2.27 kiali still imports Timer from 'globals' (baseUrl-era path). New tsconfig resolves the bare
// specifier to Node types instead, so this shim preserves the intended browser timer alias.
export type Timer = ReturnType<typeof setInterval>;
