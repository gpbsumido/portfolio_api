export interface GoogleAuthRow {
  user_id: string;
  access_token: string;
  refresh_token: string;
  token_expiry: Date;
  google_cal_id: string;
  channel_id: string | null;
  resource_id: string | null;
  channel_expiry: Date | null;
  sync_token: string | null;
}

export interface OAuthState {
  userId: string;
  origin: string;
}

export interface TokenExchangeResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export interface GoogleCalendarItem {
  id: string;
  summary?: string;
  description?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
  status?: string;
  updated?: string;
  colorId?: string;
}

export interface CalendarRow {
  id: string;
  syncMode: string;
  syncToken?: string;
}

export interface WebhookEventFields {
  title?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  allDay?: boolean;
  color?: string;
}
