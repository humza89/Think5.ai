/**
 * Usage metering (Phase 0 T16), implementing the T0.5 UsageMeter contract.
 *
 * `PrismaUsageMeter.record` writes one immutable UsageEvent row per
 * idempotency key: a replay is accepted and reported as deduplicated, never
 * counted twice. After a fresh write it emits `usage/event.recorded`
 * best-effort so the aggregation job wakes up; the row is the source of
 * truth, so a lost event only delays a rollup.
 *
 * `recordUsage` is what emit points call: it fills defaults, respects
 * FF_P0_USAGE_METERING and never throws (metering must not break the
 * product path it observes).
 */
import { UNIT_FOR_KIND, validateUsageEvent, type UsageEvent, type UsageKind, type UsageMeter, type UsageRecordResult } from "@/lib/contracts/usage";
import { NoopTelemetry, type Telemetry } from "@/lib/contracts/telemetry";

export interface UsageEventTable {
  findUnique(args: { where: { id: string } }): Promise<{ id: string } | null>;
  create(args: { data: Record<string, unknown> }): Promise<unknown>;
}

export interface UsageDb {
  usageEvent: UsageEventTable;
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && (error as { code?: string }).code === "P2002");
}

export class PrismaUsageMeter implements UsageMeter {
  constructor(
    private readonly db: UsageDb,
    private readonly telemetry: Telemetry = new NoopTelemetry(),
    private readonly emit?: (event: UsageEvent) => Promise<void>,
  ) {}

  async record(event: UsageEvent): Promise<UsageRecordResult> {
    validateUsageEvent(event);
    const existing = await this.db.usageEvent.findUnique({ where: { id: event.id } });
    if (existing) return { accepted: true, deduplicated: true };
    try {
      await this.db.usageEvent.create({
        data: {
          id: event.id,
          tenantId: event.tenantId,
          kind: event.kind,
          quantity: event.quantity,
          unit: event.unit,
          occurredAt: new Date(event.occurredAt),
          subjectType: event.metadata?.subjectType ?? subjectTypeOf(event.kind),
          subjectId: event.subjectId,
          source: event.source,
          metadata: event.metadata ?? undefined,
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) return { accepted: true, deduplicated: true };
      throw error;
    }
    this.telemetry.withContext({ tenantId: event.tenantId }).counter("usage.recorded", 1, { kind: event.kind, unit: event.unit });
    if (this.emit) await this.emit(event).catch(() => {});
    return { accepted: true, deduplicated: false };
  }
}

export function subjectTypeOf(kind: UsageKind): string {
  if (kind.startsWith("interview.")) return "interview";
  if (kind === "message.sent") return "message";
  if (kind === "ats.sync") return "integration";
  if (kind === "storage.bytes") return "recording";
  if (kind === "avatar.seconds") return "avatar_session";
  return "ai_call";
}

export interface RecordUsageInput {
  /** Idempotency key derived from the subject, e.g. `interview:{id}:completed`. */
  id: string;
  tenantId: string | null | undefined;
  kind: UsageKind;
  quantity?: number;
  subjectId: string;
  source: string;
  occurredAt?: Date | string;
  metadata?: Record<string, string | number | boolean | null>;
}

export function meteringEnabled(): boolean {
  const raw = process.env.FF_P0_USAGE_METERING;
  if (raw === undefined || raw === "") return true;
  return raw.toLowerCase() === "true" || raw === "1";
}

let defaultMeter: PrismaUsageMeter | null = null;

export async function getUsageMeter(): Promise<PrismaUsageMeter> {
  if (defaultMeter) return defaultMeter;
  const { prisma } = await import("@/lib/prisma");
  defaultMeter = new PrismaUsageMeter(prisma, new NoopTelemetry(), async (event) => {
    const { inngest } = await import("@/inngest/client");
    await inngest.send({ name: "usage/event.recorded", data: { id: event.id, tenantId: event.tenantId, kind: event.kind, occurredAt: event.occurredAt } });
  });
  return defaultMeter;
}

/** For tests: replace the default meter. */
export function setUsageMeterForTests(meter: PrismaUsageMeter | null): void {
  defaultMeter = meter;
}

/** Emit-point helper: never throws, no-op when the flag is off. */
export async function recordUsage(input: RecordUsageInput): Promise<UsageRecordResult | null> {
  if (!meteringEnabled()) return null;
  try {
    const meter = await getUsageMeter();
    const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();
    return await meter.record({
      id: input.id,
      tenantId: input.tenantId || "unscoped",
      kind: input.kind,
      quantity: input.quantity ?? 1,
      unit: UNIT_FOR_KIND[input.kind],
      occurredAt: occurredAt.toISOString(),
      subjectId: input.subjectId,
      source: input.source,
      metadata: input.metadata,
    });
  } catch (error) {
    console.warn("[usage] record failed:", error instanceof Error ? error.message : error);
    return null;
  }
}
