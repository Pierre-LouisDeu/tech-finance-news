/**
 * PostgreSQL Database Connection
 */

import { Pool, PoolClient, QueryResult } from 'pg';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let pool: Pool | null = null;

/**
 * Get or create database pool
 */
export function getPool(): Pool {
  if (!pool) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return pool;
}

/**
 * Initialize database connection pool and schema
 */
export async function initDatabase(): Promise<void> {
  if (pool) {
    logger.debug('Database pool already initialized');
    return;
  }

  pool = new Pool({
    connectionString: config.database.url,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  // Test connection
  try {
    const client = await pool.connect();
    logger.info('Database connection established');
    client.release();
  } catch (error) {
    logger.fatal({ error }, 'Failed to connect to database');
    throw error;
  }

  // Initialize schema
  await initSchema();
}

/**
 * Initialize database schema
 */
async function initSchema(): Promise<void> {
  const schemaPath = join(__dirname, 'schema.sql');
  const schema = readFileSync(schemaPath, 'utf-8');

  try {
    await pool!.query(schema);
    logger.info('Database schema initialized');
  } catch (error) {
    logger.error({ error }, 'Failed to initialize schema');
    throw error;
  }
}

/**
 * Execute a query and return rows
 */
export async function query<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const result = await pool!.query(text, params);
  return result.rows as T[];
}

/**
 * Execute a query and return full result
 */
export async function queryResult(
  text: string,
  params?: unknown[]
): Promise<QueryResult> {
  return pool!.query(text, params);
}

/**
 * Execute a query and return first row or null
 */
export async function queryOne<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T | null> {
  const result = await pool!.query(text, params);
  return (result.rows[0] as T) ?? null;
}

/**
 * Get a client from the pool for transactions
 */
export async function getClient(): Promise<PoolClient> {
  return pool!.connect();
}

/**
 * Close database connection pool
 */
export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('Database connection pool closed');
  }
}

/**
 * Check if database is initialized
 */
export function isDatabaseInitialized(): boolean {
  return pool !== null;
}

export { Pool, PoolClient };
