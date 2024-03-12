/* eslint-env node */

import { Configuration as WebpackConfiguration, DefinePlugin as DefinePlugin } from 'webpack';
import { Configuration as WebpackDevServerConfiguration } from 'webpack-dev-server';
import * as path from 'path';
import { ConsoleRemotePlugin } from '@openshift-console/dynamic-plugin-sdk-webpack';
import TsconfigPathsPlugin from 'tsconfig-paths-webpack-plugin';
import ForkTsCheckerWebpackPlugin from 'fork-ts-checker-webpack-plugin';

const NodePolyfillPlugin = require('node-polyfill-webpack-plugin');

interface Configuration extends WebpackConfiguration {
  devServer?: WebpackDevServerConfiguration;
}

const config: Configuration = {
  mode: 'development',
  // No regular entry points. The remote container entry is handled by ConsoleRemotePlugin.
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
    plugins: [new TsconfigPathsPlugin()]
  },
  module: {
    rules: [
      {
        test: /\.(ts|tsx)$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'babel-loader',
            options: {
              presets: [['react-app', { typescript: true }]]
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
        test: /\.(png|jpg|jpeg|gif|svg|woff2?|ttf|eot|otf)(\?.*$|$)/,
        type: 'asset/resource'
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
    // Allow bridge running in a container to connect to the plugin dev server.
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
    new ConsoleRemotePlugin(),
    new DefinePlugin({
      'process.env.API_PROXY': JSON.stringify(process.env.API_PROXY),
      'process.env.CSS_PREFIX': JSON.stringify(process.env.CSS_PREFIX),
      'process.env.GLOBAL_SCROLLBAR': JSON.stringify(process.env.GLOBAL_SCROLLBAR)
    }),
    new NodePolyfillPlugin(),
    new ForkTsCheckerWebpackPlugin({
      typescript: {
        configFile: '../tsconfig.json',
        diagnosticOptions: {
          syntactic: true
        },
        mode: 'write-references'
      }
    })
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
