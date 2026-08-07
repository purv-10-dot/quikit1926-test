export interface KPI {
  label:          string
  rawValue:       number
  value:          string
  delta:          number
  deltaDirection: 'up' | 'down'
  unit:           'shortNumber' | 'number' | 'currency'
}

export interface Channel {
  name:           string
  reach:          number
  engagePercent:  number | null
  traffic:        number
  leads:          number
  roi:            number
  status:         'green' | 'yellow' | 'red'
}

export interface FunnelStep {
  label: string
  value: number
  color: string
}

export interface SEOData {
  clicks:      number
  impressions: number
  ctr:         string | number
  topQueries:  Array<{ query: string; clicks: number; impressions: number; position: string }>
  topPages:    Array<{ page: string; clicks: number; impressions: number }>
}

export interface GBPData {
  searches:      number
  calls:         number
  reviews:       number
  directions:    number
  rating:        number
  websiteClicks: number
}

export interface DashboardData {
  week:        string
  kpis:        KPI[]
  channels:    Channel[]
  funnel:      FunnelStep[]
  seo:         SEOData | null
  content:     unknown[]
  topPosts:    unknown[]
  gbp:         GBPData
  products:    unknown[]
  team:        unknown[]
  actions:     unknown[]
  alerts:      number
  lastUpdated: string
}
