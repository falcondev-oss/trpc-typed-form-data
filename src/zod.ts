import type { FileValidationOptions, FileValue } from './file'
import { z } from 'zod'
import { file as fileStandardSchema } from './file'

export type { FileValidationOptions, FileValue } from './file'
export { isFile } from './file'

/**
 * A zod file validator — a drop-in replacement for `z.file()` that you can nest inside
 * `z.object({ ... })` like any other zod schema. Validates that a value is file-like and,
 * optionally, checks its size and MIME type. The parsed value is typed as {@link FileValue}.
 *
 * Reach for this instead of `z.file()` when the schema is shared with a React Native / Expo client:
 * `z.file()`'s type resolves to `any` there (so uploads lose type-checking), whereas this validator
 * keeps a stable {@link FileValue} type across the tRPC server → client boundary. A real `File` and
 * a `ReactNativeFile` both pass; a non-file value (e.g. a number) is rejected at parse time and, when
 * used with tRPC, at compile time.
 *
 * For non-zod stacks, the same validator is available as a Standard Schema from
 * `@falcondev-oss/trpc-typed-form-data/server`.
 *
 * @param opts - Optional size / MIME constraints. See {@link FileValidationOptions}.
 * @returns A zod schema that parses to a {@link FileValue}.
 *
 * @example
 * ```ts
 * import { z } from 'zod'
 * import { typedFormData } from '@falcondev-oss/trpc-typed-form-data/server'
 * import { file } from '@falcondev-oss/trpc-typed-form-data/zod'
 *
 * export const uploadAvatar = publicProcedure
 *   .input(typedFormData(z.object({
 *     userId: z.string(),
 *     avatar: file({ maxSize: 10_000_000, mimeTypes: ['image/png', 'image/jpeg'] }),
 *   })))
 *   .mutation(({ input }) => save(input.userId, input.avatar))
 * ```
 */
export function file(opts?: FileValidationOptions) {
  const schema = fileStandardSchema(opts)

  return z.custom<FileValue>().superRefine((value, ctx) => {
    const result = schema['~standard'].validate(value)
    if (result instanceof Promise) throw new TypeError('file() validation must be synchronous')

    for (const issue of result.issues ?? [])
      ctx.addIssue(typeof issue.message === 'string' ? issue.message : 'Invalid file')
  })
}
