export interface SiteConfig {
  id: string
  name: string
  niche: 'comparatif' | 'classement' | 'autre'
  domain: string
  sheet_csv_url: string
  cloudflare_project: string
  description?: string
  status: 'live' | 'draft' | 'building' | 'error'
  created_at: string
  last_deployed?: string
  pages_count?: number
  products_count?: number
}

export interface HubConfig {
  sites: SiteConfig[]
  version: string
  updated_at: string
}

export function emptySite(): Partial<SiteConfig> {
  return {
    niche: 'comparatif',
    status: 'draft',
    created_at: new Date().toISOString(),
  }
}

export function slugify(str: string): string {
  return str.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}
