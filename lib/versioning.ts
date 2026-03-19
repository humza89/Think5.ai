import { createHash } from 'crypto';

export function computeContentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

export function computeJsonHash(obj: unknown): string {
  return computeContentHash(JSON.stringify(obj));
}
