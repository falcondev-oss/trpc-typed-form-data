import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { TRPCRootObject } from '@trpc/server'
import type { TypedFormData, TypedFormDataSymbolPayload } from './internal'
import { initTRPC } from '@trpc/server/unstable-core-do-not-import'
export type { TypedFormData, TypedFormDataSymbolPayload } from './internal'

export const typedFormDataSymbol = Symbol('TypedFormData')

function parseFormDataFiles(formData: FormData, fileArrayKeys: string[]) {
  const output = {} as Record<string, File | File[] | null | undefined>

  for (const key of formData.keys()) {
    if (output[key]) continue

    output[key] = (
      fileArrayKeys.includes(key) ? formData.getAll(key) : formData.get(key)
    ) as File | null
  }

  return output
}

export function typedFormData<S extends StandardSchemaV1<object>>(
  schema: S,
): StandardSchemaV1<
  TypedFormData<StandardSchemaV1.InferInput<S>>,
  StandardSchemaV1.InferOutput<S>
> {
  return {
    '~standard': {
      async validate(value) {
        if (!(value instanceof FormData))
          return {
            issues: [
              {
                message: 'Expected FormData',
              },
            ],
          }

        const payload = (
          value as FormData & { [typedFormDataSymbol]?: TypedFormDataSymbolPayload }
        )[typedFormDataSymbol]
        if (!payload)
          return {
            issues: [
              {
                message:
                  'FormData does not contain typed payload. Make sure to create it using `createTypedFormData` frontend helper and add `typedFormDataMiddleware` middleware to your TRPC router.',
              },
            ],
          }

        return schema['~standard'].validate({
          ...payload.data,
          ...parseFormDataFiles(value, payload.fileArrayKeys),
        })
      },
      vendor: '@falcondev-oss/trpc-typed-form-data',
      version: 1,
    },
  }
}

export function createTypedFormDataPlugin<
  Trpc extends Pick<TRPCRootObject<any, any, any, any>, '_config'>,
>(
  trpc: Trpc,
  opts?: {
    /**
     * The field used to transfer serialized data in the FormData.
     * @default '~data'
     */
    transferDataKey?: string
  },
) {
  const t = initTRPC.create()

  return {
    middleware: t.procedure.use(async ({ input, getRawInput, next, type }) => {
      // input is undefined when FormData is used
      if (type === 'subscription' || type === 'query' || input) return next()

      const formData = (await getRawInput()) as FormData & {
        [typedFormDataSymbol]: TypedFormDataSymbolPayload
      }
      if (!formData || !(formData instanceof FormData)) return next()

      const transferKey = opts?.transferDataKey ?? '~data'
      const json = formData.get(transferKey)
      if (typeof json !== 'string') return next()

      const payload = trpc._config.transformer.output.deserialize(JSON.parse(json)) as
        | TypedFormDataSymbolPayload
        | undefined
      if (!payload) return next()

      formData[typedFormDataSymbol] = payload
      formData.delete(transferKey)

      return next()
    }),
  }
}
