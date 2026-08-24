export type MetricName = 'LCP' | 'CLS' | 'FCP' | 'INP' | 'TTFB';
export type Rating = 'good' | 'needs-improvement' | 'poor';

/**
 * Physically-plausible ceilings for a metric's value. CLS is a unitless
 * layout-shift score; the other four are milliseconds. A background-tab load
 * reported as a multi-minute LCP, or a measurement glitch, is not a real user
 * experience - these bound what counts as a sample so one impossible row can't
 * sit in a percentile forever. Shared by the ingest validator and the read
 * queries so both sides agree on what is real.
 */
export const PLAUSIBLE_MAX = { timing: 60_000, cls: 10 } as const;

/** The ceiling for a given metric name. */
export function plausibleMaxFor(metric: string): number {
  return metric === 'CLS' ? PLAUSIBLE_MAX.cls : PLAUSIBLE_MAX.timing;
}

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
