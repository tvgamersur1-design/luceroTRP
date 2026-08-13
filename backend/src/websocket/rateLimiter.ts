import { Socket } from 'socket.io';
import { logger } from '../utils/logger';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const WINDOW_MS = 1000; // 1 second
const MAX_EVENTS_PER_WINDOW = 15; // 15 events per second per socket
const MAX_LOCATION_EVENTS_PER_WINDOW = 5; // stricter for location updates

const socketLimits = new Map<string, RateLimitEntry>();
const socketLocationLimits = new Map<string, RateLimitEntry>();

function cleanupExpiredLimits(): void {
  const now = Date.now();
  for (const [key, entry] of socketLimits.entries()) {
    if (now > entry.resetAt) socketLimits.delete(key);
  }
  for (const [key, entry] of socketLocationLimits.entries()) {
    if (now > entry.resetAt) socketLocationLimits.delete(key);
  }
}

// Run cleanup every 30 seconds
setInterval(cleanupExpiredLimits, 30000);

export function rateLimitMiddleware(socket: Socket, event: string): boolean {
  const socketId = socket.id;
  const now = Date.now();

  // Special rate limit for location updates
  if (event === 'location:update') {
    const key = `loc:${socketId}`;
    let entry = socketLocationLimits.get(key);

    if (!entry || now > entry.resetAt) {
      socketLocationLimits.set(key, { count: 1, resetAt: now + WINDOW_MS });
      return true;
    }

    entry.count++;
    if (entry.count > MAX_LOCATION_EVENTS_PER_WINDOW) {
      logger.warn(`[RateLimit] Socket ${socketId} exceeded location rate limit (${entry.count}/${MAX_LOCATION_EVENTS_PER_WINDOW})`);
      return false;
    }
    return true;
  }

  // General rate limit for other events
  const key = `gen:${socketId}`;
  let entry = socketLimits.get(key);

  if (!entry || now > entry.resetAt) {
    socketLimits.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }

  entry.count++;
  if (entry.count > MAX_EVENTS_PER_WINDOW) {
    logger.warn(`[RateLimit] Socket ${socketId} exceeded general rate limit (${entry.count}/${MAX_EVENTS_PER_WINDOW}) for event '${event}'`);
    return false;
  }
  return true;
}

export function removeSocketLimits(socketId: string): void {
  socketLimits.delete(`gen:${socketId}`);
  socketLocationLimits.delete(`loc:${socketId}`);
}
