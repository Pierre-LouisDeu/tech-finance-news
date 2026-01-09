/**
 * SQLite Database Connection
 */

import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { SCHEMA, MIGRATIONS } from './schema.js';

let db: Database.Database | null = null;

/**
 * Get or create database connection
 */
export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

/**
 * Initialize database connection and schema
 */
export function initDatabase(): Database.Database {
  if (db) {
    logger.debug('Database already initialized');
    return db;
  }

  const dbPath = config.database.path;

  // Ensure data directory exists
  const dataDir = dirname(dbPath);
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
    logger.info({ path: dataDir }, 'Created data directory');
  }

  // Create database connection
  db = new Database(dbPath);

  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  // Enable WAL mode for better concurrent access
  db.pragma('journal_mode = WAL');

  // Initialize schema
  db.exec(SCHEMA);
  logger.info({ path: dbPath }, 'Database schema initialized');

  // Run migrations
  for (const migration of MIGRATIONS) {
    db.exec(migration);
  }

  if (MIGRATIONS.length > 0) {
    logger.info({ count: MIGRATIONS.length }, 'Database migrations applied');
  }

  return db;
}

/**
 * Close database connection
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
    logger.info('Database connection closed');
  }
}

/**
 * Check if database is initialized
 */
export function isDatabaseInitialized(): boolean {
  return db !== null;
}

export { Database };
