/**
 * UsageMeter contract (T0.5, persisted by T16 through the outbox into an
 * additive `UsageEvent` table; billing stays Phase 5).
 *
 * Usage is an append-only ledger. An event is identified by `id`, which is
 * the idempotency key: recording the same id twice must be accepted once and
 * reported as deduplicated, never counted twice and never updated in place.
 */

export const USAGE_KINDS = [
  "interview.started",
  "interview.completed",
  "ai.tokens",
  "avatar.seconds",
  "storage.bytes",
  "message.sent",
  "ats.sync",
] as const;

export type UsageKind = (typeof USAGE_KINDS)[number];
export type UsageUnit = "count" | "tokens" | "seconds" | "bytes";

export const UNIT_FOR_KIND: Readonly<Record<UsageKind, UsageUnit>> = {
  "interview.started": "count",
  "interview.completed": "count",
  "ai.tokens": "tokens",
  "avatar.seconds": "seconds",
  "storage.bytes": "bytes",
  "message.sent": "count",
  "ats.sync": "count",
};

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface UsageEvent {
  /** Idempotency key. Same id ⇒ same event; never re-counted. */
  readonly id: string;
  readonly tenantId: string;
  readonly kind: UsageKind;
  readonly quantity: number;
  readonly unit: UsageUnit;
  /** ISO-8601 timestamp of when the usage happened (not when it was recorded). */
  readonly occurredAt: string;
  /** The entity the usage is attributed to (interview id, message id, ...). */
  readonly subjectId: string;
  readonly metadata?: Readonly<Record<string, JsonValue>>;
  /** Emitting component, e.g. "relay", "api:/api/interviews", "inngest:report". */
  readonly source: string;
}

export interface UsageRecordResult {
  accepted: boolean;
  /** True when `id` had already been recorded; the ledger is unchanged. */
  deduplicated: boolean;
}

export interface UsageMeter {
  record(event: UsageEvent): Promise<UsageRecordResult>;
}

/** Throws a descriptive error for an event that violates the contract. */
export function validateUsageEvent(event: UsageEvent): void {
  if (!event.id) throw new Error("UsageEvent.id (idempotency key) is required");
  if (!event.tenantId) throw new Error("UsageEvent.tenantId is required");
  if (!(USAGE_KINDS as readonly string[]).includes(event.kind)) {
    throw new Error(`Unknown usage kind: ${String(event.kind)}`);
  }
  if (typeof event.quantity !== "number" || !Number.isFinite(event.quantity) || event.quantity < 0) {
    throw new Error("UsageEvent.quantity must be a finite number >= 0");
  }
  if (event.unit !== UNIT_FOR_KIND[event.kind]) {
    throw new Error(`UsageEvent.unit must be "${UNIT_FOR_KIND[event.kind]}" for kind "${event.kind}"`);
  }
  if (Number.isNaN(Date.parse(event.occurredAt))) throw new Error("UsageEvent.occurredAt must be ISO-8601");
  if (!event.subjectId) throw new Error("UsageEvent.subjectId is required");
  if (!event.source) throw new Error("UsageEvent.source is required");
}

/** Reference append-only meter for tests and the conformance harness. */
export class InMemoryUsageMeter implements UsageMeter {
  private readonly ledger = new Map<string, UsageEvent>();

  async record(event: UsageEvent): Promise<UsageRecordResult> {
    validateUsageEvent(event);
    if (this.ledger.has(event.id)) return { accepted: true, deduplicated: true };
    this.ledger.set(event.id, Object.freeze({ ...event }));
    return { accepted: true, deduplicated: false };
  }

  /** Snapshot of the ledger in insertion order; mutations do not reach the meter. */
  events(): readonly UsageEvent[] {
    return [...this.ledger.values()];
  }

  total(tenantId: string, kind: UsageKind): number {
    let sum = 0;
    for (const event of this.ledger.values()) if (event.tenantId === tenantId && event.kind === kind) sum += event.quantity;
    return sum;
  }
}
