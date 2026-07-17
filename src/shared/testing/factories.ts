import { v4 as uuidv4 } from 'uuid';

export function createTestUser(overrides: Partial<{ sub: string; email: string }> = {}) {
  return {
    sub: overrides.sub ?? `auth0|test-${uuidv4()}`,
    email: overrides.email ?? `test-${uuidv4().slice(0, 8)}@example.com`,
  };
}

export function createTestPost(
  overrides: Partial<{
    id: string;
    userSub: string;
    type: string;
    content: string;
    caption: string;
  }> = {},
) {
  return {
    id: overrides.id ?? uuidv4(),
    userSub: overrides.userSub ?? `auth0|test-${uuidv4()}`,
    type: overrides.type ?? 'text',
    content: overrides.content ?? 'Test post content',
    caption: overrides.caption ?? undefined,
  };
}

export function createTestCalendarEvent(
  overrides: Partial<{
    id: string;
    title: string;
    description: string;
    startDate: string;
    endDate: string;
    allDay: boolean;
    calendarId: string;
  }> = {},
) {
  return {
    id: overrides.id ?? uuidv4(),
    title: overrides.title ?? 'Test Event',
    description: overrides.description ?? 'A test calendar event',
    startDate: overrides.startDate ?? new Date().toISOString(),
    endDate: overrides.endDate ?? new Date(Date.now() + 3600_000).toISOString(),
    allDay: overrides.allDay ?? false,
    calendarId: overrides.calendarId ?? uuidv4(),
  };
}

export function createTestVital(
  overrides: Partial<{
    metric: string;
    value: number;
    rating: string;
    page: string;
    appVersion: string;
  }> = {},
) {
  return {
    metric: overrides.metric ?? 'LCP',
    value: overrides.value ?? 1200,
    rating: overrides.rating ?? 'good',
    page: overrides.page ?? '/home',
    app_version: overrides.appVersion ?? '1.0.0',
  };
}

export function createTestProfile(
  overrides: Partial<{
    username: string;
    displayName: string;
    bio: string;
    isPublic: boolean;
  }> = {},
) {
  return {
    username: overrides.username ?? `user_${uuidv4().slice(0, 8)}`,
    display_name: overrides.displayName ?? 'Test User',
    bio: overrides.bio ?? 'A test bio',
    is_public: overrides.isPublic ?? true,
  };
}
