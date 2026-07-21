declare const typedFormDataBrand: unique symbol

export type TypedFormDataSymbolPayload = {
  data: Record<string, unknown>
  fileArrayKeys: string[]
}

/**
 * A `FormData` whose fields are described by `T`, giving you end-to-end type safety on file uploads.
 *
 * You get one from `createTypedFormData` on the client and pass it to a mutation whose input is a
 * `typedFormData` schema — the field types are checked against the schema at compile time.
 *
 * @typeParam T - The shape of the form fields, e.g. `{ postId: string; avatar: FileValue }`.
 *
 * @example
 * ```ts
 * const data: TypedFormData<{ postId: string; avatar: FileValue }> = createTypedFormData({
 *   postId,
 *   avatar: new ReactNativeFile({ uri, name }),
 * })
 *
 * await client.upload.mutate(data)
 * ```
 */
export type TypedFormData<T extends object> = {
  readonly [typedFormDataBrand]: T
}
