import { pgTable, uuid, text, jsonb, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  nickname: text('nickname').notNull(),
  birthDate: text('birth_date').notNull(),
  birthTime: text('birth_time'),
  birthPlace: text('birth_place'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const dreams = pgTable('dreams', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id'),
  dreamText: text('dream_text').notNull(),
  astroInfo: jsonb('astro_info'),
  result: jsonb('result').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
