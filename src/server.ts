import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { TRPCRootObject } from '@trpc/server'
import type { TypedFormData } from './internal'
import { TRANSFER_DATA_KEY, typedFormDataSymbol } from './internal'
export type { TypedFormData } from './internal'

function parseFormDataFiles(formData: FormData) {
  const output = {} as Record<string, File | File[] | null | undefined>
  for (const [key, value] of formData.entries()) {
    if (value === 'null') output[key] = null
    else if (value === 'undefined') output[key] = undefined
    else if (value instanceof File) {
      const existing = output[key]
      if (Array.isArray(existing)) output[key] = [...existing, value]
      else if (existing) output[key] = [existing, value]
      else output[key] = value
    }
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

        const parsedData = (value as FormData & { [typedFormDataSymbol]?: object })[
          typedFormDataSymbol
        ]
        if (!parsedData)
          return {
            issues: [
              {
                message:
                  'FormData does not contain typed data. Make sure to create it using `createTypedFormData` frontend helper and add `typedFormDataMiddleware` middleware to your TRPC router.',
              },
            ],
          }

        return schema['~standard'].validate({
          ...parsedData,
          ...parseFormDataFiles(value),
        })
      },
      vendor: '@falcondev-oss/trpc-typed-form-data',
      version: 1,
    },
  }
}

export function typedFormDataMiddleware<Trpc extends TRPCRootObject<any, any, any, any>>(
  trpc: Trpc,
) {
  return trpc.middleware(async ({ input, getRawInput, next, type }) => {
    // input is undefined when FormData is used
    if (type === 'subscription' || type === 'query' || input) return next()

    const formData = await getRawInput()
    if (!formData || !(formData instanceof FormData)) return next()

    const json = formData.get(TRANSFER_DATA_KEY)
    if (typeof json !== 'string') return next()

    const parsed = trpc._config.transformer.output.deserialize(JSON.parse(json)) as
      | object
      | undefined
    if (!parsed) return next()
    ;(formData as FormData & { [typedFormDataSymbol]: unknown })[typedFormDataSymbol] = parsed
    formData.delete(TRANSFER_DATA_KEY)

    return next()
  })
}
