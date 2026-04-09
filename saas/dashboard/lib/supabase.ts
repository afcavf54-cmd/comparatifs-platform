// lib/supabase.ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseKey)

// ── Types ────────────────────────────────────────────────────
export type Site = {
  id: string
  slug: string
  name: string
  domain: string
  base_path: string
  status: 'draft' | 'live' | 'paused'
  accent: string
  accent2: string
  bg: string
  ink: string
  font_title: string
  font_body: string
  sheet_csv_url: string | null
  analytics_id: string | null
  seo_year: number
  template_id: string | null
  pages_count: number
  last_built: string | null
  created_at: string
}

export type Product = {
  id: string
  site_id: string
  slug: string
  nom: string
  marque: string
  type: 'citadine' | 'compact' | 'trio' | 'premium'
  prix: number
  poids: number
  note_confort: number
  note_manip: number
  note_pliage: number
  siege_auto: boolean
  note_amazon: number
  description: string
  points_forts: string[]
  points_faibles: string[]
  verdict_si: string[]
  url_amazon: string | null
  photo_url: string | null
  disponible: boolean
  active: boolean
}

export type Build = {
  id: string
  site_id: string
  status: 'pending' | 'running' | 'success' | 'error'
  trigger: string
  pages_built: number
  duration_ms: number | null
  log: string | null
  gh_run_id: string | null
  created_at: string
  finished_at: string | null
}

export type Template = {
  id: string
  slug: string
  name: string
  filename: string
  description: string
  status: 'active' | 'draft' | 'archived'
  content: string | null
  sections: any[]
  version: number
  updated_at: string
}

// ── Helpers ──────────────────────────────────────────────────
export async function getSites() {
  const { data, error } = await supabase
    .from('sites')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as Site[]
}

export async function getSite(slug: string) {
  const { data, error } = await supabase
    .from('sites')
    .select('*')
    .eq('slug', slug)
    .single()
  if (error) throw error
  return data as Site
}

export async function getProducts(siteId: string) {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('site_id', siteId)
    .eq('active', true)
    .order('nom')
  if (error) throw error
  return data as Product[]
}

export async function upsertProduct(product: Partial<Product>) {
  const { data, error } = await supabase
    .from('products')
    .upsert(product, { onConflict: 'site_id,slug' })
    .select()
    .single()
  if (error) throw error
  return data as Product
}

export async function getBuilds(siteId: string, limit = 20) {
  const { data, error } = await supabase
    .from('builds')
    .select('*')
    .eq('site_id', siteId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data as Build[]
}

export async function getTemplates() {
  const { data, error } = await supabase
    .from('templates')
    .select('*')
    .order('created_at')
  if (error) throw error
  return data as Template[]
}
