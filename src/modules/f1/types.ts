export interface QueueStatus {
  pending: number;
  active: number;
  maxConcurrent: number;
}

export interface QueueTimeoutResponse {
  error: string;
  details: string;
  suggestion: string;
}

export interface CacheClearResponse {
  message: string;
}
