// ---------------------------------------------------------------------------
// Operator module — DTOs
// ---------------------------------------------------------------------------

export type SalesGranularity = 'day' | 'week' | 'month' | 'year';

export type StoreDto = {
  id: string;
  name: string;
  location: string;
  province: string;
  /** IANA zone the store's day is measured in. */
  timezone: string;
  status: string;
  temperature: number;
  uptime: number;
  revenue24h: number;
  lastPing: string;
};

export type InventoryItemDto = {
  id: string;
  storeId: string;
  productName: string;
  category: string;
  currentStock: number;
  capacity: number;
  price: number;
  lastRestocked: string;
};

export type AlertDto = {
  id: string;
  storeId: string;
  severity: string;
  category: string;
  message: string;
  timestamp: string;
  acknowledged: boolean;
};

export type ActivityEventDto = {
  id: string;
  storeId: string;
  type: string;
  description: string;
  timestamp: string;
  actor?: string;
};

export type SaleDto = {
  id: string;
  storeId: string;
  productName: string;
  category: string;
  unitPrice: number;
  quantity: number;
  total: number;
  timestamp: string;
};

export type SalesPeriodBucket = {
  label: string;
  start: string;
  revenue: number;
  units: number;
};

export type FleetStoreTotal = {
  storeId: string;
  storeName: string;
  totalRevenue: number;
  unitsSold: number;
};

export type FleetSalesAnalyticsDto = {
  granularity: SalesGranularity;
  buckets: SalesPeriodBucket[];
  byStore: FleetStoreTotal[];
  totalRevenue: number;
};

export type PromotionDto = {
  id: string;
  storeId: string;
  /** Null means the whole store. */
  productName: string | null;
  percent: number;
  startsAt: string;
  endsAt: string | null;
  /** Derived from the window and the clock, never stored. */
  status: string;
};

export type RestockSessionDto = {
  id: string;
  storeId: string;
  startedAt: string;
  completedAt: string | null;
  actor: string | null;
  notes: string | null;
};

export type RestockLineDto = {
  id: string;
  sessionId: string;
  itemId: string;
  expectedQty: number;
  /** Null means the restocker deliberately skipped counting this slot. */
  countedQty: number | null;
  added: number;
  removed: number;
  removalReason: string | null;
  resultingStock: number | null;
  /** Derived: matches-expected | correction | not-counted. */
  countStatus: string;
};

/** A planogram box: the item it holds (null = empty) and its sensor state. */
export type PlanogramBox = {
  itemId: string | null;
  sensorMatch: boolean;
};

export type StoreSummaryDto = {
  storeId: string;
  alertCount: number;
  inventoryHealth: number;
  hasCritical: boolean;
  hasWarning: boolean;
};

export type FleetStatsDto = {
  criticalAlerts: number;
  warningAlerts: number;
  lowStockItems: number;
  avgInventoryHealth: number;
};

export type AlertTrendBucketDto = {
  hour: string;
  count: number;
};

export type FleetSummaryDto = {
  summaries: StoreSummaryDto[];
  fleetStats: FleetStatsDto;
  alertTrend: AlertTrendBucketDto[];
};

// ---------------------------------------------------------------------------
// Fleet aggregation endpoints (planner benchmarks, product performance,
// shrink, search index, finance)
// ---------------------------------------------------------------------------

export type BenchmarksDto = {
  avgItemPrice: number;
  itemsPerOrder: number;
  sampleSize: number;
} | null;

export type ProductPerformanceRowDto = {
  productName: string;
  category: string;
  unitsSold: number;
  revenue: number;
  avgPerDay: number;
  performanceIndex: number;
  hasSales: boolean;
};

export type ProductPerformanceDto = {
  rangeId: string;
  days: number;
  products: ProductPerformanceRowDto[];
};

export type ShrinkSummaryDto = {
  unexplainedUnits: number;
  unexplainedValue: number;
  explainedUnits: number;
  explainedValue: number;
  explainedByReason: Record<string, number>;
  countedLines: number;
  notCountedLines: number;
};

export type StoreShrinkDto = ShrinkSummaryDto & {
  storeId: string;
  storeName: string;
};

export type FleetShrinkDto = {
  stores: StoreShrinkDto[];
  totals: ShrinkSummaryDto;
};

export type SearchIndexDto = {
  stores: { id: string; name: string; status: string }[];
  products: { name: string; category: string }[];
};

export type PayoutWeekDto = {
  weekStart: string;
  grossRevenue: number;
  transactionCount: number;
  transactionFees: number;
  platformFees: number;
  netPayout: number;
};

export type FinanceDto = {
  weeks: PayoutWeekDto[];
  totals: {
    grossRevenue: number;
    transactionCount: number;
    transactionFees: number;
    platformFees: number;
    netPayout: number;
  };
  fees: {
    transactionRate: number;
    transactionFlat: number;
    platformPerUnitMonthly: number;
  };
};
