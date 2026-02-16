import type { TRPCLink } from '@trpc/client'
import type { TransformerOptions } from '@trpc/client/unstable-internals'
import type { AnyTRPCRouter } from '@trpc/server'
import type { TypedFormData, TypedFormDataSymbolPayload } from './internal'
import { isFormData } from '@trpc/client'
import { getTransformer } from '@trpc/client/unstable-internals'
import { observable } from '@trpc/server/observable'
export type { TypedFormData, TypedFormDataSymbolPayload } from './internal'

export const typedFormDataSymbol = Symbol('TypedFormData')

function isFileArray(value: unknown): value is File[] {
  return Array.isArray(value) && value.length > 0 && value.every((v) => v instanceof File)
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
      for (const file of value) formData.append(key, file, file.name)
      formData[typedFormDataSymbol].fileArrayKeys.push(key)
    } else formData.set(key, value, value.name)
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
