// ---------------------------------------------------------------------------
// Drizzle ORM schema definitions — social modules
// ---------------------------------------------------------------------------

import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

// ── users ──────────────────────────────────────────────────────────────────
export const users = pgTable('users', {
  sub: text('sub').primaryKey(),
  email: text('email').notNull(),
  name: text('name'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
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
  notificationsSeenAt: timestamp('notifications_seen_at', {
    withTimezone: true,
  }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
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
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
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
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type PostMedia = InferSelectModel<typeof postMedia>;
export type NewPostMedia = InferInsertModel<typeof postMedia>;

// ── post_likes ─────────────────────────────────────────────────────────────
export const postLikes = pgTable('post_likes', {
  id: uuid('id').primaryKey().defaultRandom(),
  postId: uuid('post_id')
    .notNull()
    .references(() => posts.id, { onDelete: 'cascade' }),
  userSub: text('user_sub')
    .notNull()
    .references(() => users.sub),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type PostLike = InferSelectModel<typeof postLikes>;
export type NewPostLike = InferInsertModel<typeof postLikes>;

// ── post_replies ───────────────────────────────────────────────────────────
export const postReplies = pgTable('post_replies', {
  id: uuid('id').primaryKey().defaultRandom(),
  postId: uuid('post_id')
    .notNull()
    .references(() => posts.id, { onDelete: 'cascade' }),
  userSub: text('user_sub')
    .notNull()
    .references(() => users.sub),
  content: text('content').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type PostReply = InferSelectModel<typeof postReplies>;
export type NewPostReply = InferInsertModel<typeof postReplies>;

// ── reposts ────────────────────────────────────────────────────────────────
export const reposts = pgTable('reposts', {
  id: uuid('id').primaryKey().defaultRandom(),
  postId: uuid('post_id')
    .notNull()
    .references(() => posts.id, { onDelete: 'cascade' }),
  userSub: text('user_sub')
    .notNull()
    .references(() => users.sub),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type Repost = InferSelectModel<typeof reposts>;
export type NewRepost = InferInsertModel<typeof reposts>;

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
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type Follow = InferSelectModel<typeof follows>;
export type NewFollow = InferInsertModel<typeof follows>;

// ── referrals ────────────────────────────────────────────────────────────────
export const referrals = pgTable('referrals', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  targetPath: text('target_path').notNull().default('/'),
  label: text('label'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type Referral = InferSelectModel<typeof referrals>;
export type NewReferral = InferInsertModel<typeof referrals>;

// ── referral_clicks ──────────────────────────────────────────────────────────
export const referralClicks = pgTable('referral_clicks', {
  id: uuid('id').primaryKey().defaultRandom(),
  referralId: uuid('referral_id')
    .notNull()
    .references(() => referrals.id, { onDelete: 'cascade' }),
  uaHash: text('ua_hash'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type ReferralClick = InferSelectModel<typeof referralClicks>;
export type NewReferralClick = InferInsertModel<typeof referralClicks>;
