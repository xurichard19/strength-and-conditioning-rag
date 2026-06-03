export type Source = {
  id?: string | number | null
  source?: string | null
  page?: string | number | null
  text: string
}

export type QueryResponse = {
  text?: string
  sources?: Source[]
}
