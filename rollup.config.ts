import commonjs from '@rollup/plugin-commonjs'
import nodeResolve from '@rollup/plugin-node-resolve'
import typescript from '@rollup/plugin-typescript'

const config = [
  {
    input: 'src/index.ts',
    output: {
      esModule: true,
      file: 'dist/index.js',
      format: 'es',
      sourcemap: true
    },
    plugins: [typescript(), nodeResolve({ preferBuiltins: true }), commonjs()]
  },
  // Published to npm as locale-guard-cli, not committed
  {
    input: 'src/cli/index.ts',
    output: {
      file: 'cli/dist/cli.js',
      format: 'es',
      banner: '#!/usr/bin/env node'
    },
    plugins: [
      typescript({ outDir: 'cli/dist' }),
      nodeResolve({ preferBuiltins: true }),
      commonjs()
    ]
  }
]

export default config
