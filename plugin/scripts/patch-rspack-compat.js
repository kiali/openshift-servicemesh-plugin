/**
 * Patches OpenShift Console SDK packages to work with Rspack instead of webpack.
 *
 * The ConsoleRemotePlugin and the dynamic-plugin-sdk-webpack packages hard-code
 * require('webpack') calls and rely on webpack-specific APIs that do not exist in
 * Rspack. This script applies targeted string replacements so those packages use
 * @rspack/core instead, selects Module Federation Plugin V1 (compatible with the
 * SDK's expectations), and shims the few Compilation API gaps.
 *
 * The script is idempotent: re-running it on already-patched files is safe.
 * It runs automatically via the "postinstall" hook in package.json.
 */

const fs = require('fs');
const path = require('path');

function patchFile(relPath, patches) {
  const abs = path.resolve(__dirname, '..', 'node_modules', relPath);
  if (!fs.existsSync(abs)) {
    console.log(`[patch-rspack-compat] skip (not found): ${relPath}`);
    return;
  }
  let src = fs.readFileSync(abs, 'utf8');
  let changed = false;

  for (const { from, to, label } of patches) {
    if (typeof from === 'string') {
      if (src.includes(from)) {
        src = src.split(from).join(to);
        changed = true;
        console.log(`[patch-rspack-compat] ${relPath}: ${label}`);
      }
    } else {
      const replaced = src.replace(from, to);
      if (replaced !== src) {
        src = replaced;
        changed = true;
        console.log(`[patch-rspack-compat] ${relPath}: ${label}`);
      }
    }
  }

  if (changed) {
    fs.writeFileSync(abs, src, 'utf8');
  }
}

// Patch @openshift/dynamic-plugin-sdk-webpack
patchFile('@openshift/dynamic-plugin-sdk-webpack/dist/index.cjs.js', [
  {
    from: "require('webpack')",
    to: "require('@rspack/core')",
    label: "redirect require('webpack') -> @rspack/core"
  },
  {
    from: /webpack\.container\.ModuleFederationPlugin(?!V1)/g,
    to: 'webpack.container.ModuleFederationPluginV1',
    label: 'use ModuleFederationPluginV1 for webpack 5 compat'
  },
  {
    from: "type: 'jsonp'",
    to: "type: 'var'",
    label: "change library.type default from 'jsonp' to 'var'"
  },
  {
    from: /compilation\.assetsInfo(?! \|\|)/g,
    to: "(compilation.assetsInfo || new Map(compilation.getAssets().map(a => [a.name, a.info])))",
    label: 'shim compilation.assetsInfo for Rspack compat'
  }
]);

// Patch @openshift-console/dynamic-plugin-sdk-webpack
patchFile('@openshift-console/dynamic-plugin-sdk-webpack/lib/webpack/ConsoleRemotePlugin.js', [
  {
    from: "require(\"webpack\")",
    to: "require(\"@rspack/core\")",
    label: "redirect require('webpack') -> @rspack/core"
  },
  {
    from: /compiler\.hooks\.thisCompilation\.tap\(ConsoleRemotePlugin\.name, \(compilation\) => \{[\s\S]*?webpack\.NormalModule\.getCompilationHooks[\s\S]*?\n        \}\);/,
    to: '// [rspack-compat] thisCompilation hook with NormalModule.getCompilationHooks removed (not available in Rspack)',
    label: 'remove NormalModule.getCompilationHooks block'
  }
]);

console.log('[patch-rspack-compat] done');
