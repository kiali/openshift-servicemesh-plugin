// Webpack module federation entry points for the lite plugin subtree.
// The root plugin-metadata.ts spreads these into its exposedModules map so that
// all lite wiring stays inside this subtree and the root file needs no
// further changes when pages are added here.
export const liteModules = {
  liteIstioDetailPage: './lite/pages/IstioDetailPage',
  liteIstiosPage: './lite/pages/IstiosPage',
  liteKialiDetailPage: './lite/pages/KialiDetailPage',
  liteKialisPage: './lite/pages/KialisPage'
};
