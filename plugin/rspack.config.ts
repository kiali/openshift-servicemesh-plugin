/* eslint-env node */
/* eslint-disable @typescript-eslint/no-require-imports */

import './rspack-webpack-shim';

import { type Compiler, Compilation, type RspackOptions, ProvidePlugin, DefinePlugin, sources } from '@rspack/core';
import * as path from 'path';
import { ConsoleRemotePlugin } from '@openshift-console/dynamic-plugin-sdk-webpack';
import MergeJsonWebpackPlugin from 'merge-jsons-webpack-plugin';

import pluginMetadata from './plugin-metadata';
import extensions from './console-extensions';

// Appends a loadPluginEntry() call to the Module Federation entry file.
// OpenShift Console loads plugins by calling loadPluginEntry('name', get, init).
// With library.type 'var', Rspack generates: var ossmconsole = { get, init };
// We append the callback invocation so OpenShift Console can discover the plugin.
class WrapEntryPlugin {
  apply(compiler: Compiler): void {
    compiler.hooks.compilation.tap('WrapEntryPlugin', (compilation: Compilation) => {
      compilation.hooks.processAssets.tap(
        {
          name: 'WrapEntryPlugin',
          stage: Compilation.PROCESS_ASSETS_STAGE_ADDITIONS
        },
        () => {
          const containerName = pluginMetadata.name;

          for (const asset of compilation.getAssets()) {
            if (asset.name.startsWith('plugin-entry') && asset.name.endsWith('.js')) {
              const code = asset.source.source().toString();
              if (!code.includes('loadPluginEntry')) {
                const callbackCode =
                  `\nif (typeof loadPluginEntry === 'function') ` +
                  `{ loadPluginEntry("${containerName}", ${containerName}.get, ${containerName}.init); }\n`;
                compilation.updateAsset(asset.name, new sources.RawSource(code + callbackCode));
              }
            }

            // The SDK sets registrationMethod to 'custom' when library.type != 'jsonp',
            // but we emulate the jsonp callback pattern via loadPluginEntry(), so Console
            // needs 'callback' to discover the plugin correctly.
            if (asset.name === 'plugin-manifest.json') {
              const manifest = JSON.parse(asset.source.source().toString());
              if (manifest.registrationMethod !== 'callback') {
                manifest.registrationMethod = 'callback';
                compilation.updateAsset(asset.name, new sources.RawSource(JSON.stringify(manifest)));
              }
            }
          }
        }
      );
    });
  }
}

const config: RspackOptions = {
  mode: 'development',
  entry: {},
  context: path.resolve(__dirname, 'src'),
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name]-bundle.js',
    chunkFilename: '[name]-chunk.js',
    assetModuleFilename: 'static/media/[name].[hash][ext]'
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
    tsConfig: path.resolve(__dirname, 'tsconfig.json'),
    fallback: {
      buffer: require.resolve('buffer/'),
      crypto: false,
      stream: false,
      util: false
    }
  },
  module: {
    rules: [
      {
        test: /\.(ts|tsx)$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'builtin:swc-loader',
            options: {
              jsc: {
                parser: { syntax: 'typescript', tsx: true },
                transform: { react: { runtime: 'automatic' } }
              }
            }
          }
        ]
      },
      {
        test: /\.s[ac]ss$/,
        use: [
          'style-loader',
          {
            loader: 'css-loader',
            options: {
              modules: {
                localIdentName: process.env.CSS_PREFIX + '_[hash:base64:5]'
              }
            }
          },
          'sass-loader'
        ]
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      },
      {
        test: /\.(png|jpg|jpeg|gif|woff2?|ttf|eot|otf)(\?.*$|$)/,
        type: 'asset/resource'
      },
      {
        test: /\.(svg)$/,
        use: ['@svgr/webpack', 'file-loader']
      },
      {
        test: /\.m?js/,
        resolve: {
          fullySpecified: false
        }
      }
    ]
  },
  devServer: {
    static: './dist',
    port: 9001,
    allowedHosts: 'all',
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'X-Requested-With, Content-Type, Authorization'
    },
    devMiddleware: {
      writeToDisk: true
    }
  },
  plugins: [
    new ConsoleRemotePlugin({
      pluginMetadata,
      extensions,
      validateExtensionIntegrity: false,
      validateSharedModules: false
    }),
    new MergeJsonWebpackPlugin({
      output: {
        groupBy: [
          {
            pattern: '**/locales/en/translation.json',
            fileName: 'locales/en/plugin__ossmconsole.json'
          },
          {
            pattern: '**/locales/zh/translation.json',
            fileName: 'locales/zh/plugin__ossmconsole.json'
          }
        ]
      },
      space: 2
    }),
    new DefinePlugin({
      'process.env.API_PROXY': JSON.stringify(process.env.API_PROXY),
      'process.env.CSS_PREFIX': JSON.stringify(process.env.CSS_PREFIX),
      'process.env.GLOBAL_SCROLLBAR': JSON.stringify(process.env.GLOBAL_SCROLLBAR),
      'process.env.I18N_NAMESPACE': JSON.stringify(process.env.I18N_NAMESPACE)
    }),
    new ProvidePlugin({
      Buffer: ['buffer', 'Buffer'],
      process: 'process/browser'
    }),
    new WrapEntryPlugin()
  ],
  devtool: 'source-map',
  optimization: {
    chunkIds: 'named',
    minimize: false
  }
};

if (process.env.NODE_ENV === 'production') {
  config.mode = 'production';
  if (config.output) {
    config.output.filename = '[name]-bundle-[hash].min.js';
    config.output.chunkFilename = '[name]-chunk-[chunkhash].min.js';
  }
  if (config.optimization) {
    config.optimization.chunkIds = 'deterministic';
    config.optimization.minimize = true;
  }
}

export default config;
