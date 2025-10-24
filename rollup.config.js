import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';

const external = [
  'fs', 'path', 'events', 'crypto', 'util', 'child_process', 
  'stream', 'inspector', 'async_hooks'
];

const isProduction = process.env.NODE_ENV === 'production';

const basePlugins = [
  resolve({
    preferBuiltins: true,
    browser: false
  }),
  commonjs({
    ignoreDynamicRequires: true
  })
];

const productionPlugins = isProduction ? [
  terser({
    compress: {
      drop_console: false, // Keep console for debugging
      drop_debugger: true,
      pure_funcs: ['console.debug'],
      passes: 2
    },
    mangle: {
      reserved: ['Command', 'Option', 'Argument', 'Help', 'CommanderError']
    },
    format: {
      comments: false
    }
  })
] : [];

export default [
  // CommonJS build
  {
    input: 'src/index.js',
    output: {
      file: 'lib/index.js',
      format: 'cjs',
      exports: 'named',
      sourcemap: !isProduction
    },
    external,
    treeshake: {
      moduleSideEffects: false,
      propertyReadSideEffects: false,
      unknownGlobalSideEffects: false
    },
    plugins: [
      ...basePlugins,
      ...productionPlugins
    ]
  },
  
  // ES Module build
  {
    input: 'src/index.esm.js',
    output: {
      file: 'lib/index.esm.js',
      format: 'es',
      sourcemap: !isProduction
    },
    external,
    treeshake: {
      moduleSideEffects: false,
      propertyReadSideEffects: false,
      unknownGlobalSideEffects: false
    },
    plugins: [
      ...basePlugins,
      ...productionPlugins
    ]
  }
];