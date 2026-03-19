# @falcondev-oss/trpc-typed-form-data

Type-safe integration of FormData with tRPC using Standard Schema.

## Installation

```bash
npm install @falcondev-oss/trpc-typed-form-data
```

## Usage

### Server

```ts
import { typedFormData, typedFormDataMiddleware } from '@falcondev-oss/trpc-typed-form-data/server'
import { initTRPC } from '@trpc/server'
import { z } from 'zod'

const trpc = initTRPC.create()
const typedFormDataPlugin = createTypedFormDataPlugin(trpc) // 👈 create plugin instance

const procedure = trpc.procedure.concat(typedFormDataPlugin.middleware) // 👈 add middleware to procedure

const router = trpc.router({
  upload: procedure
    .input(
      // 👇 use any standard schema wrapped with `typedFormData`
      typedFormData(
        z.object({
          file: z.instanceof(File),
          userId: z.string(),
        }),
      ),
    )
    .mutation(async ({ input }) => {
      const { file, userId } = input // input is now properly typed

      await file.arrayBuffer() // works as expected
    }),
})
```

### Client

```ts
import { createTypedFormData, typedFormDataLink } from '@falcondev-oss/trpc-typed-form-data/client'
import { createTRPCClient, httpLink } from '@trpc/client'

const trpc = createTRPCClient<AppRouter>({
  links: [
    typedFormDataLink(), // 👈 add link
    httpLink({
      url: '/api/trpc',
    }),
  ],
})

await trpc.upload.mutate(
  createTypedFormData({
    // input is properly typed here as well
    userId: '123',
    file: new File(['file contents'], 'example.txt'),
  }),
)
```
