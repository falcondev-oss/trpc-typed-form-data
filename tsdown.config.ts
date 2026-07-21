import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/client.ts', 'src/server.ts', 'src/zod.ts'],
  format: 'esm',
  dts: true,
  outDir: './dist',
})
