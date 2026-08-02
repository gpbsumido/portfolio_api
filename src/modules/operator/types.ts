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
