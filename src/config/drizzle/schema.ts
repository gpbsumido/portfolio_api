// ---------------------------------------------------------------------------
// Drizzle ORM schema definitions — social modules
// ---------------------------------------------------------------------------

import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import type {
  AuditAction,
  EnvironmentConfig,
  FlagKind,
  Variation,
} from '../../modules/feature-flags/types.js';
import type { PlanogramBox } from '../../modules/operator/types.js';

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

// ── feature_flags ────────────────────────────────────────────────────────────
// One row per flag; its per-environment config is stored as JSONB so the shape
// mirrors the paul-explore `Flag` contract 1:1 (see modules/feature-flags).
export const featureFlags = pgTable('feature_flags', {
  key: text('key').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  kind: text('kind').$type<FlagKind>().notNull(),
  tags: jsonb('tags').$type<string[]>().notNull(),
  variations: jsonb('variations').$type<Variation[]>().notNull(),
  environments: jsonb('environments')
    .$type<Record<string, EnvironmentConfig>>()
    .notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type FeatureFlag = InferSelectModel<typeof featureFlags>;
export type NewFeatureFlag = InferInsertModel<typeof featureFlags>;

// ── feature_flag_audit ───────────────────────────────────────────────────────
export const featureFlagAudit = pgTable('feature_flag_audit', {
  id: uuid('id').primaryKey().defaultRandom(),
  flagKey: text('flag_key').notNull(),
  environment: text('environment').notNull(),
  action: text('action').$type<AuditAction>().notNull(),
  summary: text('summary').notNull(),
  actor: text('actor').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type FeatureFlagAudit = InferSelectModel<typeof featureFlagAudit>;
export type NewFeatureFlagAudit = InferInsertModel<typeof featureFlagAudit>;

// ── operator_stores ──────────────────────────────────────────────────────────
// Backs the paul-explore operator dashboard. Moves the demo off in-memory data
// onto real rows so the fleet reads and the sales analytics are real DB calls.
export const operatorStores = pgTable("operator_stores", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  location: text("location").notNull().default(""),
  province: text("province").notNull().default("ON"),
  timezone: text("timezone"),
  status: text("status").notNull().default("online"),
  temperature: doublePrecision("temperature").notNull().default(4),
  uptime: doublePrecision("uptime").notNull().default(99),
  revenue24h: doublePrecision("revenue_24h").notNull().default(0),
  lastPing: timestamp("last_ping", { withTimezone: true }).defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type OperatorStore = InferSelectModel<typeof operatorStores>;
export type NewOperatorStore = InferInsertModel<typeof operatorStores>;

// ── operator_inventory ───────────────────────────────────────────────────────
export const operatorInventory = pgTable("operator_inventory", {
  id: uuid("id").primaryKey().defaultRandom(),
  storeId: uuid("store_id")
    .notNull()
    .references(() => operatorStores.id, { onDelete: "cascade" }),
  productName: text("product_name").notNull(),
  category: text("category").notNull().default(""),
  currentStock: integer("current_stock").notNull().default(0),
  capacity: integer("capacity").notNull().default(1),
  price: doublePrecision("price").notNull().default(0),
  lastRestocked: timestamp("last_restocked", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type OperatorInventoryItem = InferSelectModel<typeof operatorInventory>;
export type NewOperatorInventoryItem = InferInsertModel<
  typeof operatorInventory
>;

// ── operator_alerts ──────────────────────────────────────────────────────────
export const operatorAlerts = pgTable("operator_alerts", {
  id: uuid("id").primaryKey().defaultRandom(),
  storeId: uuid("store_id")
    .notNull()
    .references(() => operatorStores.id, { onDelete: "cascade" }),
  severity: text("severity").notNull(),
  category: text("category").notNull(),
  message: text("message").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  acknowledged: boolean("acknowledged").notNull().default(false),
});

export type OperatorAlert = InferSelectModel<typeof operatorAlerts>;
export type NewOperatorAlert = InferInsertModel<typeof operatorAlerts>;

// ── operator_activity ────────────────────────────────────────────────────────
export const operatorActivity = pgTable("operator_activity", {
  id: uuid("id").primaryKey().defaultRandom(),
  storeId: uuid("store_id")
    .notNull()
    .references(() => operatorStores.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  description: text("description").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  actor: text("actor"),
});

export type OperatorActivityEvent = InferSelectModel<typeof operatorActivity>;
export type NewOperatorActivityEvent = InferInsertModel<
  typeof operatorActivity
>;

// ── operator_planograms ──────────────────────────────────────────────────────
// One row per store; the layout is a JSONB array of boxes so the client can
// read and replace the whole arrangement in one call.
export const operatorPlanograms = pgTable("operator_planograms", {
  storeId: uuid("store_id")
    .primaryKey()
    .references(() => operatorStores.id, { onDelete: "cascade" }),
  boxes: jsonb("boxes").$type<PlanogramBox[]>().notNull().default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type OperatorPlanogram = InferSelectModel<typeof operatorPlanograms>;

// ── operator_restock_sessions ────────────────────────────────────────────────
export const operatorRestockSessions = pgTable("operator_restock_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  storeId: uuid("store_id")
    .notNull()
    .references(() => operatorStores.id, { onDelete: "cascade" }),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  actor: text("actor"),
  notes: text("notes"),
});

export type OperatorRestockSession = InferSelectModel<
  typeof operatorRestockSessions
>;
export type NewOperatorRestockSession = InferInsertModel<
  typeof operatorRestockSessions
>;

// ── operator_restock_lines ───────────────────────────────────────────────────
// countedQty is nullable on purpose: null means the restocker skipped counting
// this slot, which is a recorded decision rather than missing data.
export const operatorRestockLines = pgTable("operator_restock_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => operatorRestockSessions.id, { onDelete: "cascade" }),
  itemId: uuid("item_id")
    .notNull()
    .references(() => operatorInventory.id, { onDelete: "cascade" }),
  expectedQty: integer("expected_qty").notNull().default(0),
  countedQty: integer("counted_qty"),
  added: integer("added").notNull().default(0),
  removed: integer("removed").notNull().default(0),
  removalReason: text("removal_reason"),
  resultingStock: integer("resulting_stock"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export type OperatorRestockLine = InferSelectModel<typeof operatorRestockLines>;
export type NewOperatorRestockLine = InferInsertModel<
  typeof operatorRestockLines
>;
export type NewOperatorPlanogram = InferInsertModel<typeof operatorPlanograms>;

// ── operator_sales ───────────────────────────────────────────────────────────
export const operatorSales = pgTable("operator_sales", {
  id: uuid("id").primaryKey().defaultRandom(),
  storeId: uuid("store_id")
    .notNull()
    .references(() => operatorStores.id, { onDelete: "cascade" }),
  productName: text("product_name").notNull(),
  category: text("category").notNull().default(""),
  unitPrice: doublePrecision("unit_price").notNull().default(0),
  quantity: integer("quantity").notNull().default(1),
  total: doublePrecision("total").notNull().default(0),
  occurredAt: timestamp("occurred_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type OperatorSale = InferSelectModel<typeof operatorSales>;
export type NewOperatorSale = InferInsertModel<typeof operatorSales>;
