/**
 * Build script for mock-server
 *
 * Uses esbuild to bundle the mock server with CSS/asset imports handled.
 * This allows the handlers to use real Kiali types without browser dependency issues.
 */

import * as esbuild from 'esbuild';
import * as path from 'path';
import * as fs from 'fs';

const pluginRoot = path.resolve(__dirname, '..');

/**
 * Read tsconfig.json and extract path aliases.
 * This ensures the build works with both relative paths and path aliases.
 */
function getTsconfigPaths(): Record<string, string> {
  const tsconfigPath = path.resolve(pluginRoot, 'tsconfig.json');
  let tsconfig: { compilerOptions?: { paths?: Record<string, string[]>; baseUrl?: string } };

  try {
    const content = fs.readFileSync(tsconfigPath, 'utf-8');
    tsconfig = JSON.parse(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Failed to read or parse tsconfig.json at ${tsconfigPath}: ${message}`);
    return {};
  }

  const paths = tsconfig.compilerOptions?.paths || {};
  const baseUrl = tsconfig.compilerOptions?.baseUrl || '.';

  const aliases: Record<string, string> = {};

  for (const [key, values] of Object.entries(paths)) {
    if (Array.isArray(values) && values.length > 0) {
      const aliasKey = key.replace(/\/\*$/, '');
      const aliasValue = values[0].replace(/\/\*$/, '');
      aliases[aliasKey] = path.resolve(pluginRoot, baseUrl, aliasValue);
    }
  }

  return aliases;
}

/**
 * esbuild plugin to resolve TypeScript path aliases from tsconfig.json.
 * Supports both path aliases (types/Auth) and relative paths (../../types/Auth).
 */
function tsconfigPathsPlugin(): esbuild.Plugin {
  const aliases = getTsconfigPaths();

  return {
    name: 'tsconfig-paths',
    setup(build) {
      for (const [alias, targetPath] of Object.entries(aliases)) {
        // Escape special regex characters in alias to prevent injection
        const escapedAlias = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const filter = new RegExp(`^${escapedAlias}($|/.*)`);

        build.onResolve({ filter }, (args) => {
          const suffix = args.path.slice(alias.length);
          const resolved = path.join(targetPath, suffix);

          const extensions = ['.ts', '.tsx', '.js', '.jsx', ''];
          for (const ext of extensions) {
            const fullPath = resolved + ext;
            if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
              return { path: fullPath };
            }

            const indexPath = path.join(resolved, `index${ext}`);
            if (fs.existsSync(indexPath)) {
              return { path: indexPath };
            }
          }

          return { path: resolved };
        });
      }
    }
  };
}

async function build() {
  try {
    await esbuild.build({
      entryPoints: [path.resolve(__dirname, 'server.ts')],
      bundle: true,
      platform: 'node',
      target: 'node20',
      outfile: path.resolve(pluginRoot, 'dist/mock-server.js'),
      format: 'cjs',
      // Ignore CSS, SCSS, and asset imports
      loader: {
        '.css': 'empty',
        '.scss': 'empty',
        '.sass': 'empty',
        '.less': 'empty',
        '.svg': 'empty',
        '.png': 'empty',
        '.jpg': 'empty',
        '.jpeg': 'empty',
        '.gif': 'empty',
        '.woff': 'empty',
        '.woff2': 'empty',
        '.ttf': 'empty',
        '.eot': 'empty',
      },
      // Don't bundle node_modules that work fine in Node
      external: ['express'],
      // Support both relative paths and tsconfig path aliases
      plugins: [tsconfigPathsPlugin()],
      // Source maps for debugging
      sourcemap: true,
      // Define environment
      define: {
        'process.env.NODE_ENV': '"development"',
      },
    });
    console.log('Mock server built successfully: dist/mock-server.js');
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

build();
