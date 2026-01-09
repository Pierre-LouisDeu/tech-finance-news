/**
 * Simple rate limiter for API calls
 */

import { sleep } from './retry.js';

export class RateLimiter {
  private lastCallTime = 0;
  private readonly minIntervalMs: number;

  constructor(requestsPerSecond: number) {
    this.minIntervalMs = Math.ceil(1000 / requestsPerSecond);
  }

  async waitForSlot(): Promise<void> {
    const now = Date.now();
    const timeSinceLastCall = now - this.lastCallTime;
    const waitTime = Math.max(0, this.minIntervalMs - timeSinceLastCall);

    if (waitTime > 0) {
      await sleep(waitTime);
    }

    this.lastCallTime = Date.now();
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    await this.waitForSlot();
    return fn();
  }
}
