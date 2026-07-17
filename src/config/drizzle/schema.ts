// ---------------------------------------------------------------------------
// Drizzle ORM schema definitions — social modules
// ---------------------------------------------------------------------------

import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  boolean,
  doublePrecision,
} from 'drizzle-orm/pg-core';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';

// ── users ──────────────────────────────────────────────────────────────────
export const users = pgTable('users', {
  sub: text('sub').primaryKey(),
  email: text('email').notNull(),
  name: text('name'),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;

// ── user_profiles ──────────────────────────────────────────────────────────
export const userProfiles = pgTable('user_profiles', {
  userSub: text('user_sub')
    .primaryKey()
    .references(() => users.sub),
  username: text('username').notNull().unique(),
  displayName: text('display_name'),
  bio: text('bio'),
  avatarUrl: text('avatar_url'),
  isPublic: boolean('is_public').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type UserProfile = InferSelectModel<typeof userProfiles>;
export type NewUserProfile = InferInsertModel<typeof userProfiles>;

// ── posts ──────────────────────────────────────────────────────────────────
export const posts = pgTable('posts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userSub: text('user_sub')
    .notNull()
    .references(() => users.sub),
  type: text('type').notNull(),
  caption: text('caption'),
  content: text('content'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type Post = InferSelectModel<typeof posts>;
export type NewPost = InferInsertModel<typeof posts>;

// ── post_media ─────────────────────────────────────────────────────────────
export const postMedia = pgTable('post_media', {
  id: uuid('id').primaryKey().defaultRandom(),
  postId: uuid('post_id')
    .notNull()
    .references(() => posts.id, { onDelete: 'cascade' }),
  s3Key: text('s3_key').notNull(),
  url: text('url').notNull(),
  width: integer('width'),
  height: integer('height'),
  position: integer('position').notNull(),
  blurDataUrl: text('blur_data_url'),
  mediaType: text('media_type').notNull(),
  thumbnailUrl: text('thumbnail_url'),
  duration: doublePrecision('duration'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type PostMedia = InferSelectModel<typeof postMedia>;
export type NewPostMedia = InferInsertModel<typeof postMedia>;

// ── follows ────────────────────────────────────────────────────────────────
export const follows = pgTable('follows', {
  id: uuid('id').primaryKey().defaultRandom(),
  followerSub: text('follower_sub')
    .notNull()
    .references(() => users.sub),
  followingSub: text('following_sub')
    .notNull()
    .references(() => users.sub),
  status: text('status').notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type Follow = InferSelectModel<typeof follows>;
export type NewFollow = InferInsertModel<typeof follows>;
