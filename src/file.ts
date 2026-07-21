import type { StandardSchemaV1 } from '@standard-schema/spec'

/**
 * The type of an uploaded file, as inferred by {@link file} and the zod `file` validator.
 *
 * It is a structural subset of the Web `File`/`Blob` API — `name`, `size`, `type`, and the
 * `arrayBuffer`/`stream`/`slice`/`text` readers — so a real `File`, an Expo/React Native
 * {@link ReactNativeFile}, and any other file-like value all satisfy it. Reach for this type when
 * you need to annotate a value that came out of one of these schemas, e.g. the `input` of a tRPC
 * procedure or a helper that receives an upload.
 *
 * Unlike `z.file()` (whose inferred type is `InstanceType<globalThis.File>` and silently degrades to
 * `any` in environments without a DOM `File` type, such as React Native), `FileValue` is the same
 * concrete type everywhere — including across a tRPC server → client type boundary.
 *
 * @example
 * ```ts
 * async function saveUpload(file: FileValue) {
 *   await writeFile(file.name, Buffer.from(await file.arrayBuffer()))
 * }
 * ```
 */
export interface FileValue {
  readonly name: string
  readonly size: number
  readonly type: string
  arrayBuffer: () => Promise<ArrayBuffer>
  stream: () => ReadableStream<Uint8Array>
  slice: (start?: number, end?: number, contentType?: string) => Blob
  text: () => Promise<string>
}

/** Constraints applied by {@link file} and the zod `file` validator. All are optional. */
export interface FileValidationOptions {
  /** Reject files larger than this many bytes (inclusive limit). */
  maxSize?: number
  /** Reject files smaller than this many bytes (inclusive limit). */
  minSize?: number
  /** Allow-list of MIME types, compared against `file.type` (e.g. `['image/png', 'image/jpeg']`). */
  mimeTypes?: string[]
}

/**
 * Type guard that narrows an `unknown` value to {@link FileValue}.
 *
 * Returns `true` for a real `File`, an Expo/React Native {@link ReactNativeFile}, or any other
 * file-like object. Use it for ad-hoc checks outside of a schema.
 *
 * @example
 * ```ts
 * if (isFile(value)) console.log(value.name, value.size)
 * ```
 */
export function isFile(value: unknown): value is FileValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as FileValue).name === 'string' &&
    typeof (value as FileValue).size === 'number' &&
    typeof (value as FileValue).type === 'string' &&
    typeof (value as FileValue).arrayBuffer === 'function' &&
    typeof (value as FileValue).stream === 'function'
  )
}

/**
 * A file validator built as a {@link https://standardschema.dev Standard Schema}, usable with any
 * library that accepts one (tRPC, and most modern validators). Validates that a value is file-like
 * and, optionally, checks its size and MIME type. Both the input and output type are
 * {@link FileValue}.
 *
 * Prefer this over `z.file()` when the schema is shared across environments (notably React Native),
 * where `z.file()`'s type degrades to `any`. If you build your schema with zod, use the zod-native
 * `file` from `@falcondev-oss/trpc-typed-form-data/zod` instead so it slots into `z.object({ ... })`.
 *
 * @param opts - Optional size / MIME constraints. See {@link FileValidationOptions}.
 * @returns A Standard Schema whose validated value is a {@link FileValue}.
 *
 * @example
 * ```ts
 * import { file } from '@falcondev-oss/trpc-typed-form-data/server'
 *
 * const avatar = file({ maxSize: 10_000_000, mimeTypes: ['image/png', 'image/jpeg'] })
 *
 * const result = await avatar['~standard'].validate(someValue)
 * if (result.issues) throw new Error(result.issues[0].message)
 * result.value // FileValue
 * ```
 */
export function file(opts?: FileValidationOptions): StandardSchemaV1<FileValue, FileValue> {
  return {
    '~standard': {
      version: 1,
      vendor: '@falcondev-oss/trpc-typed-form-data',
      validate(value) {
        if (!isFile(value)) return { issues: [{ message: 'Expected a file' }] }

        if (opts?.maxSize !== undefined && value.size > opts.maxSize)
          return { issues: [{ message: `File must be at most ${opts.maxSize} bytes` }] }

        if (opts?.minSize !== undefined && value.size < opts.minSize)
          return { issues: [{ message: `File must be at least ${opts.minSize} bytes` }] }

        if (opts?.mimeTypes !== undefined && !opts.mimeTypes.includes(value.type))
          return { issues: [{ message: `File type "${value.type}" is not allowed` }] }

        return { value }
      },
    },
  }
}
