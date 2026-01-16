import type { TRPCLink } from '@trpc/client'
import type { TransformerOptions } from '@trpc/client/unstable-internals'
import type { AnyTRPCRouter } from '@trpc/server'
import type { ConditionalPick } from 'type-fest'
import type { TypedFormData } from '.'
import { isFormData } from '@trpc/client'
import { getTransformer } from '@trpc/client/unstable-internals'
import { observable } from '@trpc/server/observable'
import { TRANSFER_DATA_KEY, typedFormDataSymbol } from './internal'

export function createTypedFormData<
  T extends object,
  Files extends ConditionalPick<T, File | null | File[] | undefined>,
  Data extends Omit<T, keyof Files>,
>(data: Data, files: Files) {
  const formData = new FormData()
  ;(formData as FormData & { [typedFormDataSymbol]: Data })[typedFormDataSymbol] = data

  for (const [key, value] of Object.entries(files) as [
    keyof Files & string,
    File | File[] | null | undefined,
  ][]) {
    if (value == null) formData.set(key, value === null ? 'null' : 'undefined')
    else if (Array.isArray(value)) for (const file of value) formData.append(key, file, file.name)
    else formData.append(key, value, value.name)
  }

  return formData as TypedFormData<T>
}

export function typedFormDataLink<TRouter extends AnyTRPCRouter>(
  opts?: TransformerOptions<TRouter['_def']['_config']['$types']>,
): TRPCLink<TRouter> {
  return () => {
    return ({ next, op }) => {
      return observable((observer) => {
        if (isFormData(op.input) && typedFormDataSymbol in op.input) {
          const data = op.input[typedFormDataSymbol]
          if (data)
            op.input.append(
              TRANSFER_DATA_KEY,
              JSON.stringify(getTransformer(opts?.transformer).input.serialize(data)),
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
