export type MetricName = 'LCP' | 'CLS' | 'FCP' | 'INP' | 'TTFB';
export type Rating = 'good' | 'needs-improvement' | 'poor';

export interface VitalInput {
  metric: string;
  value: number;
  rating: string;
  page: string;
  nav_type?: string;
  app_version?: string;
}

export interface VitalRow {
  id: number;
  metric: string;
  value: number;
  rating: string;
  page: string;
  nav_type: string | null;
  app_version: string;
  created_at: string;
}

export interface MetricSummary {
  p75: number;
  good: number;
  needsImprovement: number;
  poor: number;
  total: number;
}

export interface PageMetrics {
  page: string;
  total: number;
  metrics: Record<string, { p75: number; count: number }>;
}

export interface VersionMetrics {
  version: string;
  metrics: Record<string, { p75: number; total: number }>;
}

export interface VersionConditions {
  conditions: string;
  params: unknown[];
  nextParam: number;
}
