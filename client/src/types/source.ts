export type Source = {
  title?: string | null
  doi?: string | null
  url?: string | null
  source_type: 'research' | 'web'
  content: string
  score?: number | null
}
