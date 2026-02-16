import type { Tagged } from 'type-fest'

export type TypedFormDataSymbolPayload = {
  data: Record<string, unknown>
  fileArrayKeys: string[]
}
export type TypedFormData<T extends object> = Tagged<FormData, 'typed-form-data', T>
