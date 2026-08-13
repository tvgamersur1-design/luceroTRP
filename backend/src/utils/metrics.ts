import { logger } from './logger';

interface MetricCounters {
  auditLogFailures: number;
  auditLogSuccesses: number;
  lastFailureTime: Date | null;
}

const counters: MetricCounters = {
  auditLogFailures: 0,
  auditLogSuccesses: 0,
  lastFailureTime: null,
};

const FAILURE_THRESHOLD = 10;
const WINDOW_MS = 60 * 1000; // 1 minute
let windowStart = Date.now();

export function trackAuditLogSuccess(): void {
  counters.auditLogSuccesses++;
}

export function trackAuditLogFailure(error: unknown): void {
  counters.auditLogFailures++;
  counters.lastFailureTime = new Date();

  const now = Date.now();
  if (now - windowStart > WINDOW_MS) {
    // Reset window
    counters.auditLogFailures = 1;
    windowStart = now;
    return;
  }

  if (counters.auditLogFailures >= FAILURE_THRESHOLD) {
    logger.error(`[Metrics] AUDIT LOG FAILURE THRESHOLD EXCEEDED: ${counters.auditLogFailures} failures in last minute`, {
      counter: counters.auditLogFailures,
      lastError: error instanceof Error ? error.message : String(error),
      lastFailureTime: counters.lastFailureTime?.toISOString(),
    });
  }
}

export function getAuditLogMetrics(): MetricCounters {
  return { ...counters };
}
