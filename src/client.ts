import type { TRPCLink } from '@trpc/client'
import type { TransformerOptions } from '@trpc/client/unstable-internals'
import type { AnyTRPCRouter } from '@trpc/server'
import type { TypedFormData, TypedFormDataSymbolPayload } from './internal'
import { isFormData } from '@trpc/client'
import { getTransformer } from '@trpc/client/unstable-internals'
import { observable } from '@trpc/server/observable'
export type { FileValidationOptions, FileValue } from './file'
export { file, isFile } from './file'
export type { TypedFormData, TypedFormDataSymbolPayload } from './internal'

// use keyed symbol to avoid issues with bundler code splitting
export const typedFormDataSymbol = Symbol.for('@falcondev-oss/trpc-typed-form-data/TypedFormData')

function isFileArray(value: unknown): value is File[] {
  return Array.isArray(value) && value.length > 0 && value.every((v) => v instanceof File)
}

/**
 * A `File` you can upload from React Native / Expo.
 *
 * On React Native, `FormData` only sends parts that carry a `uri` (it never reads a Blob's bytes),
 * but file validators — `z.file()`, this package's `file()`, or anything doing `instanceof File` —
 * expect a real `File`. `ReactNativeFile` is both: a genuine `File` subclass that also carries the
 * `uri` React Native needs, so it passes validation *and* uploads correctly.
 *
 * Create it synchronously from an image/document picker result and use it directly as a form value —
 * no `fetch`, no reading the file into memory:
 *
 * @example
 * ```ts
 * const { assets } = await ImagePicker.launchImageLibraryAsync()
 * const asset = assets[0]
 *
 * const file = new ReactNativeFile({
 *   uri: asset.uri,
 *   name: asset.fileName ?? 'upload.jpg',
 *   type: asset.mimeType,
 *   size: asset.fileSize,
 * })
 *
 * await client.upload.mutate(createTypedFormData({ file }))
 * ```
 */
export class ReactNativeFile extends File {
  /**
   * Build a `ReactNativeFile` from a remote URL. Sends a `HEAD` request to read the file's
   * `content-type` and `content-length` — the body is not downloaded; the upload streams from `url`.
   *
   * @param url - Remote URL to upload from.
   * @param fileName - Optional name; defaults to the last path segment of `url`.
   *
   * @example
   * ```ts
   * const file = await ReactNativeFile.fromUrl('https://example.com/photo.jpg')
   * ```
   */
  static async fromUrl(url: string, fileName?: string) {
    const res = await fetch(url, { method: 'HEAD' })
    return new ReactNativeFile({
      uri: url,
      name: fileName ?? url.split('/').pop() ?? 'file',
      type: res.headers.get('content-type') ?? undefined,
      size: Number(res.headers.get('content-length')) || undefined,
    })
  }

  readonly uri: string

  /**
   * @param props.uri - Local file URI from the picker (e.g. `file:///…`). Used for the upload.
   * @param props.name - File name, e.g. `asset.fileName`. Sent as the multipart filename.
   * @param props.type - MIME type, e.g. `asset.mimeType` (`image/jpeg`).
   * @param props.size - File size in bytes, e.g. `asset.fileSize`. Enables size checks like
   * `file({ maxSize })` / `z.file().max()`, which would otherwise see a size of `0`.
   */
  constructor(props: { uri: string; name: string; type?: string; size?: number }) {
    super([], props.name, { type: props.type })
    this.uri = props.uri

    // `File.name`/`File.size` are read-only getters. Expo's fetch/FormData polyfill reassigns
    // `name`, which throws in strict mode (https://github.com/expo/expo/issues/35512). Shadow both
    // with writable own props so those assignments no-op, and so `size` reports the real value for
    // `z.file().min()/max()` checks (the empty blob would otherwise report 0).
    Object.defineProperty(this, 'name', { value: props.name, writable: true, configurable: true })
    if (props.size != null)
      Object.defineProperty(this, 'size', { value: props.size, writable: true, configurable: true })
  }
}

/**
 * React Native's `FormData` streams a part from its `uri` and never reads a `Blob`'s bytes.
 * A {@link ReactNativeFile} is a `File` subclass backed by an empty blob (`super([], …)`), so
 * appending it directly uploads 0 bytes. Substitute the plain `{ uri, name, type }` shape RN
 * streams from instead. `ReactNativeFile` only ever exists on React Native, so this branch never
 * runs against a DOM `FormData` (where the value is a real `File` with actual bytes).
 */
function toFormDataFile(file: File): Blob {
  if (file instanceof ReactNativeFile)
    return { uri: file.uri, name: file.name, type: file.type } as unknown as Blob
  return file
}

export function createTypedFormData<T extends object>(data: T) {
  const formData = new FormData() as FormData & {
    [typedFormDataSymbol]: TypedFormDataSymbolPayload
  }
  formData[typedFormDataSymbol] = {
    data: {},
    fileArrayKeys: [],
  }

  for (const [key, value] of Object.entries(data)) {
    if (!(value instanceof File) && !isFileArray(value)) {
      formData[typedFormDataSymbol].data[key] = value
      continue
    }

    if (Array.isArray(value)) {
      for (const file of value) formData.append(key, toFormDataFile(file), file.name)
      formData[typedFormDataSymbol].fileArrayKeys.push(key)
    } else formData.set(key, toFormDataFile(value), value.name)
  }

  return formData as unknown as TypedFormData<T>
}

export function typedFormDataLink<TRouter extends AnyTRPCRouter>(
  opts?: TransformerOptions<TRouter['_def']['_config']['$types']> & {
    /**
     * The field used to transfer serialized data in the FormData.
     * @default '~data'
     */
    transferDataKey?: string
  },
): TRPCLink<TRouter> {
  return () => {
    // eslint-disable-next-line unicorn/consistent-function-scoping
    return ({ next, op }) => {
      return observable((observer) => {
        if (isFormData(op.input) && typedFormDataSymbol in op.input) {
          const payload = op.input[typedFormDataSymbol] as TypedFormDataSymbolPayload
          if (payload)
            op.input.append(
              opts?.transferDataKey ?? '~data',
              JSON.stringify(getTransformer(opts?.transformer).input.serialize(payload)),
            )
        }

        const unsubscribe = next(op).subscribe({
          next(value) {
            observer.next(value)
          },
          error(err) {
            observer.error(err)
          },
          complete() {
            observer.complete()
          },
        })
        return unsubscribe
      })
    }
  }
}
