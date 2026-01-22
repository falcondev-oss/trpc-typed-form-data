export const TRANSFER_DATA_KEY = '~data'
export const typedFormDataSymbol = Symbol('TypedFormData')
export type TypedFormData<T extends object> = FormData & {
  [typedFormDataSymbol]: T
}

export type TypedFormDataSymbolPayload = {
  data: Record<string, unknown>
  fileArrayKeys: string[]
}
