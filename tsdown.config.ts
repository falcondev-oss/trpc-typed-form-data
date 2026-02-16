import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/client.ts', 'src/server.ts'],
  format: 'esm',
  dts: true,
  outDir: './dist',
})
