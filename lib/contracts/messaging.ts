/**
 * MessageProvider contract (T0.5; T8 implements in-app, Resend email is
 * adapted, SMS stays `NotImplemented` with a typed error until a vendor is
 * approved).
 *
 * `message.id` is the idempotency key: sending the same id twice returns the
 * original provider id and does not deliver twice.
 */

export const MESSAGE_CHANNELS = ["in_app", "email", "sms"] as const;
export type MessageChannel = (typeof MESSAGE_CHANNELS)[number];

export interface MessageRecipient {
  userId?: string;
  email?: string;
  phone?: string;
}

export interface OutboundMessage {
  /** Idempotency key. */
  id: string;
  tenantId: string;
  channel: MessageChannel;
  to: MessageRecipient;
  subject?: string;
  body: string;
  metadata?: Readonly<Record<string, string>>;
}

export type DeliveryState = "queued" | "sent" | "delivered" | "failed";

export interface SendResult {
  providerId: string;
  state: DeliveryState;
  /** True when `id` had already been sent; no new delivery happened. */
  deduplicated: boolean;
}

export interface DeliveryStatus {
  providerId: string;
  state: DeliveryState;
  /** ISO-8601. */
  updatedAt: string;
  detail?: string;
}

export interface InboundWebhookRequest {
  headers: Readonly<Record<string, string>>;
  rawBody: string;
}

export type InboundEventType = "delivered" | "bounced" | "reply";

export interface InboundMessageEvent {
  type: InboundEventType;
  providerId?: string;
  /** ISO-8601. */
  occurredAt: string;
  payload: unknown;
}

/** Typed error for channels a provider does not implement. */
export class NotImplementedChannelError extends Error {
  readonly code = "CHANNEL_NOT_IMPLEMENTED" as const;

  constructor(readonly channel: MessageChannel, provider: string) {
    super(`${provider} does not implement the "${channel}" channel`);
    this.name = "NotImplementedChannelError";
  }
}

export interface MessageProvider {
  readonly name: string;
  /** Channels this provider can deliver; others throw NotImplementedChannelError. */
  readonly channels: readonly MessageChannel[];
  send(message: OutboundMessage): Promise<SendResult>;
  status(providerId: string): Promise<DeliveryStatus | null>;
  inboundWebhook(request: InboundWebhookRequest): Promise<InboundMessageEvent[]>;
}

export function validateOutboundMessage(message: OutboundMessage): void {
  if (!message.id) throw new Error("OutboundMessage.id (idempotency key) is required");
  if (!message.tenantId) throw new Error("OutboundMessage.tenantId is required");
  if (!(MESSAGE_CHANNELS as readonly string[]).includes(message.channel)) {
    throw new Error(`Unknown message channel: ${String(message.channel)}`);
  }
  if (!message.body) throw new Error("OutboundMessage.body is required");
  const { to } = message;
  if (message.channel === "in_app" && !to.userId) throw new Error("in_app messages require to.userId");
  if (message.channel === "email" && !to.email) throw new Error("email messages require to.email");
  if (message.channel === "sms" && !to.phone) throw new Error("sms messages require to.phone");
}

/** Reference provider: in-app and email in memory, SMS not implemented. */
export class InMemoryMessageProvider implements MessageProvider {
  readonly name = "in-memory";
  readonly channels: readonly MessageChannel[] = ["in_app", "email"];
  readonly sent: OutboundMessage[] = [];
  private readonly byMessageId = new Map<string, SendResult>();
  private readonly statuses = new Map<string, DeliveryStatus>();
  private seq = 0;

  async send(message: OutboundMessage): Promise<SendResult> {
    validateOutboundMessage(message);
    if (!this.channels.includes(message.channel)) throw new NotImplementedChannelError(message.channel, this.name);
    const replay = this.byMessageId.get(message.id);
    if (replay) return { ...replay, deduplicated: true };

    const providerId = `msg-${++this.seq}`;
    this.sent.push({ ...message });
    const result: SendResult = { providerId, state: "sent", deduplicated: false };
    this.byMessageId.set(message.id, result);
    this.statuses.set(providerId, { providerId, state: "sent", updatedAt: new Date(0).toISOString() });
    return result;
  }

  async status(providerId: string): Promise<DeliveryStatus | null> {
    return this.statuses.get(providerId) ?? null;
  }

  async inboundWebhook(request: InboundWebhookRequest): Promise<InboundMessageEvent[]> {
    const parsed = JSON.parse(request.rawBody) as { events?: Array<Partial<InboundMessageEvent>> };
    const events = (parsed.events ?? []).map((event) => ({
      type: (event.type ?? "delivered") as InboundEventType,
      providerId: event.providerId,
      occurredAt: event.occurredAt ?? new Date(0).toISOString(),
      payload: event.payload ?? null,
    }));
    for (const event of events) {
      if (event.providerId && this.statuses.has(event.providerId)) {
        const state: DeliveryState = event.type === "bounced" ? "failed" : event.type === "delivered" ? "delivered" : "sent";
        this.statuses.set(event.providerId, { providerId: event.providerId, state, updatedAt: event.occurredAt });
      }
    }
    return events;
  }
}
