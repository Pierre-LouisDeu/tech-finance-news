/**
 * Environment variable validation using Zod
 */

import { z } from 'zod';
import 'dotenv/config';

const envSchema = z.object({
  // OpenAI
  OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY is required'),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),

  // Notion
  NOTION_API_KEY: z.string().min(1, 'NOTION_API_KEY is required'),
  NOTION_DATABASE_ID: z.string().min(1, 'NOTION_DATABASE_ID is required'),
  NOTION_BRIEFING_DATABASE_ID: z.string().optional(), // Optional: separate DB for daily briefings

  // Scraping
  SCRAPE_RATE_LIMIT_MS: z.coerce.number().default(2000),
  USER_AGENT: z.string().default('Mozilla/5.0 (compatible; TechNewsBot/1.0)'),

  // Database
  DB_PATH: z.string().default('./data/news.db'),

  // Logging
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  LOG_FILE: z.string().default('./logs/app.log'),

  // Scheduling
  CRON_SCHEDULE: z.string().default('0 8,11,14,17,20 * * 1-5'),
  TZ: z.string().default('Europe/Paris'),

  // Environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export type Env = z.infer<typeof envSchema>;

function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.format();
    throw new Error(`Environment validation failed:\n${JSON.stringify(errors, null, 2)}`);
  }

  return result.data;
}

export const env = validateEnv();
