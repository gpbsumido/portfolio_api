// ---------------------------------------------------------------------------
// Operator module — DTOs
// ---------------------------------------------------------------------------

export type SalesGranularity = 'day' | 'week' | 'month' | 'year';

export type StoreDto = {
  id: string;
  name: string;
  location: string;
  province: string;
  status: string;
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
