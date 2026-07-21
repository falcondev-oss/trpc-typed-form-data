# @falcondev-oss/trpc-typed-form-data

Type-safe integration of `FormData` with tRPC using [Standard Schema](https://standardschema.dev).

tRPC can't type a `FormData` input on its own: files have to travel as multipart parts, every other field arrives as an untyped string, and `input` shows up `undefined`. This package restores end-to-end type safety by carrying the non-file fields as a serialized JSON payload alongside the file parts, and validating the whole thing against a schema you control.

## Installation

```bash
npm install @falcondev-oss/trpc-typed-form-data
```

Requires `@trpc/client` and `@trpc/server` v11 as peer dependencies. `zod` v4 is an optional peer dependency, only needed if you use the `/zod` entry point.

## Usage

Three pieces work together — all of them are required:

1. **Client:** the `typedFormDataLink` serializes the non-file fields into the request.
2. **Server:** the plugin middleware deserializes them back before validation.
3. **Schema:** `typedFormData()` wraps your input schema and validates files + fields together.

### Server

Build the plugin from your tRPC instance, add its middleware to the procedures that accept uploads, and wrap the input schema in `typedFormData()`:

```ts
import {
  createTypedFormDataPlugin,
  typedFormData,
} from '@falcondev-oss/trpc-typed-form-data/server'
import { initTRPC } from '@trpc/server'
import { z } from 'zod'

const t = initTRPC.create()

const typedFormDataPlugin = createTypedFormDataPlugin(t) // 👈 create the plugin

// 👇 add the middleware to a procedure
const uploadProcedure = t.procedure.concat(typedFormDataPlugin.middleware)

export const router = t.router({
  upload: uploadProcedure
    .input(
      // 👇 wrap any Standard Schema with `typedFormData`
      typedFormData(
        z.object({
          userId: z.string(),
          file: file({ maxSize: 10 * 1024 * 1024 }),
        }),
      ),
    )
    .mutation(async ({ input }) => {
      const { userId, file } = input // input is fully typed

      await file.arrayBuffer() // works as expected
    }),
})

export type AppRouter = typeof router
```

### Client

Add `typedFormDataLink` to your links (before the terminating link), then build the payload with `createTypedFormData` and pass it straight to `.mutate()`:

```ts
import { createTypedFormData, typedFormDataLink } from '@falcondev-oss/trpc-typed-form-data/client'
import { createTRPCClient, httpLink } from '@trpc/client'
import type { AppRouter } from './server'

const trpc = createTRPCClient<AppRouter>({
  links: [
    typedFormDataLink(), // 👈 add the link, before httpLink
    httpLink({
      url: '/api/trpc',
    }),
  ],
})

await trpc.upload.mutate(
  createTypedFormData({
    // fields are type-checked against the schema
    userId: '123',
    file: new File(['file contents'], 'example.txt'),
  }),
)
```

Arrays of files are supported — pass a `File[]` under a key and every file is uploaded under it.

> **Note:** `FormData` requests can't be batched. Terminate the upload path with `httpLink`, not `httpBatchLink`.

### File validation

Instead of `z.instanceof(File)` or `z.file()`, use the built-in `file()` validator to enforce size and MIME-type constraints. It also gives you a stable `FileValue` type across the server → client boundary — unlike `z.file()`, whose inferred type degrades to `any` in environments without a DOM `File` (notably React Native), silently dropping type-checking.

For a zod schema, import the zod-native `file` so it nests inside `z.object()`:

```ts
import { typedFormData } from '@falcondev-oss/trpc-typed-form-data/server'
import { file } from '@falcondev-oss/trpc-typed-form-data/zod'
import { z } from 'zod'

typedFormData(
  z.object({
    userId: z.string(),
    avatar: file({
      maxSize: 10_000_000,
      mimeTypes: ['image/png', 'image/jpeg'],
    }),
  }),
)
```

For any other Standard Schema stack, the same validator is available as a Standard Schema from `@falcondev-oss/trpc-typed-form-data/server` (or the root export). All options — `maxSize`, `minSize`, `mimeTypes` — are optional; byte limits are inclusive.

The `isFile(value)` type guard narrows an `unknown` value to `FileValue` for ad-hoc checks outside a schema.

### React Native / Expo

React Native's `FormData` only sends parts that carry a `uri` — it never reads a Blob's bytes. Use `ReactNativeFile` (a real `File` subclass that also carries a `uri`) so uploads work _and_ pass validation. Build it synchronously from a picker result:

```ts
import { createTypedFormData, ReactNativeFile } from '@falcondev-oss/trpc-typed-form-data/client'

const { assets } = await ImagePicker.launchImageLibraryAsync()
const asset = assets[0]

const file = new ReactNativeFile({
  uri: asset.uri, // local file URI; used for the upload
  name: asset.fileName ?? 'upload.jpg', // sent as the multipart filename
  type: asset.mimeType, // MIME type, e.g. 'image/jpeg'
  size: asset.fileSize, // bytes — enables size checks like file({ maxSize })
})

await trpc.upload.mutate(createTypedFormData({ userId: '123', file }))
```

Only `uri` and `name` are required. Pass `size` if you use size constraints — the empty blob backing a `ReactNativeFile` otherwise reports `0`.

You can also build one from a remote URL. `fromUrl` sends a `HEAD` request to read the content type and length; the body is not downloaded, the upload streams from the URL:

```ts
// url from e.g. expo-file-system, expo-image-picker or similar libraries
const file = await ReactNativeFile.fromUrl('https://example.com/photo.jpg')

await trpc.upload.mutate(createTypedFormData({ userId: '123', file }))
```

## Configuration

### Transformers

If your tRPC router uses a data transformer (e.g. [superjson](https://github.com/blitz-js/superjson)), pass it to the link so the serialized payload matches on both ends:

```ts
typedFormDataLink({ transformer: superjson })
```

The payload is serialized with the link's transformer and deserialized with the router's; a mismatch throws a `BAD_REQUEST` on the server.

### Transfer field

The non-file payload travels in a `~data` field by default. To change it, set the **same** `transferDataKey` on both sides:

```ts
// client
typedFormDataLink({ transferDataKey: '__data' })
// server
createTypedFormDataPlugin(t, { transferDataKey: '__data' })
```

## API

Exported from `@falcondev-oss/trpc-typed-form-data/...`:

| Entry point | Exports                                                                         |
| ----------- | ------------------------------------------------------------------------------- |
| `/client`   | `createTypedFormData`, `typedFormDataLink`, `ReactNativeFile`, `file`, `isFile` |
| `/server`   | `typedFormData`, `createTypedFormDataPlugin`, `file`, `isFile`                  |
| `/zod`      | `file` (zod-native), `isFile`                                                   |
| `.` (root)  | `file` (Standard Schema), `isFile`                                              |

Types (`FileValue`, `FileValidationOptions`, `TypedFormData`) are re-exported from every entry point.

## License

[MIT](./LICENSE)
