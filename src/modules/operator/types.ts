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
