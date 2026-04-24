import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './api/_lib/db/schema.ts',
  out: './api/_lib/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
