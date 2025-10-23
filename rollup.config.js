import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';

const external = [
  'fs', 'path', 'events', 'crypto', 'util', 'child_process', 
  'stream', 'inspector', 'async_hooks'
];

export default [
  // CommonJS build
  {
    input: 'src/index.js',
    output: {
      file: 'lib/index.js',
      format: 'cjs',
      exports: 'named'
    },
    external,
    plugins: [
      resolve({
        preferBuiltins: true
      }),
      commonjs()
    ]
  },
  
  // ES Module build
  {
    input: 'src/index.esm.js',
    output: {
      file: 'lib/index.esm.js',
      format: 'es'
    },
    external,
    plugins: [
      resolve({
        preferBuiltins: true
      }),
      commonjs()
    ]
  },
  
  // TypeScript definitions build
  {
    input: 'src/index.d.ts',
    output: {
      file: 'lib/index.d.ts',
      format: 'es'
    },
    plugins: [
      typescript({
        declaration: true,
        emitDeclarationOnly: true,
        outDir: 'lib'
      })
    ]
  }
];