/**
 * Exponential backoff retry utility
 */

import type { RetryConfig } from '../types/index.js';
import { logger } from './logger.js';

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  factor: 2,
};

export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const { maxAttempts, initialDelayMs, maxDelayMs, factor } = {
    ...DEFAULT_RETRY_CONFIG,
    ...config,
  };

  let lastError: Error | undefined;
  let delay = initialDelayMs;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === maxAttempts) {
        logger.error({ error: lastError, attempt, maxAttempts }, 'All retry attempts exhausted');
        throw lastError;
      }

      logger.warn(
        { error: lastError.message, attempt, maxAttempts, nextDelayMs: delay },
        'Retry attempt failed, waiting before next attempt'
      );

      await sleep(delay);
      delay = Math.min(delay * factor, maxDelayMs);
    }
  }

  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export { sleep };
