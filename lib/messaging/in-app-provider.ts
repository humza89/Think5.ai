/**
 * In-app MessageProvider (Phase 0 T8) implementing the T0.5 contract over
 * the Message table. `message.id` is the idempotency key: a replay returns
 * the stored row. Email/SMS are not implemented here (NotImplementedChannelError).
 */
import {
  NotImplementedChannelError,
  validateOutboundMessage,
  type DeliveryState,
  type DeliveryStatus,
  type InboundMessageEvent,
  type MessageChannel,
  type MessageProvider,
  type OutboundMessage,
  type SendResult,
} from "@/lib/contracts/messaging";
import { conversationKey, messageState } from "./contract";

/** The T0.5 DeliveryState stops at "delivered"; read receipts are a messaging-contract detail. */
function deliveryStateOf(row: { read: boolean; deliveredAt: Date | string | null }): DeliveryState {
  const state = messageState(row);
  return state === "read" ? "delivered" : state;
}

export interface StoredMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderRole: string;
  recipientId: string;
  recipientRole: string;
  content: string;
  read: boolean;
  readAt: Date | null;
  deliveredAt: Date | null;
  createdAt: Date;
}

export interface MessageTable {
  findUnique(args: { where: { id: string } }): Promise<StoredMessage | null>;
  create(args: { data: Record<string, unknown> }): Promise<StoredMessage>;
}

export class InAppMessageProvider implements MessageProvider {
  readonly name = "in-app";
  readonly channels: readonly MessageChannel[] = ["in_app"];

  constructor(private readonly messages: MessageTable) {}

  async send(message: OutboundMessage): Promise<SendResult> {
    validateOutboundMessage(message);
    if (message.channel !== "in_app") throw new NotImplementedChannelError(message.channel, this.name);
    const existing = await this.messages.findUnique({ where: { id: message.id } });
    if (existing) return { providerId: existing.id, state: deliveryStateOf(existing), deduplicated: true };

    const meta = message.metadata ?? {};
    const senderId = meta.senderId ?? "system";
    const row = await this.messages.create({
      data: {
        id: message.id,
        conversationId: meta.conversationId ?? conversationKey(senderId, message.to.userId!),
        senderId,
        senderRole: meta.senderRole ?? "SYSTEM",
        recipientId: message.to.userId!,
        recipientRole: meta.recipientRole ?? "CANDIDATE",
        content: message.body,
      },
    });
    return { providerId: row.id, state: "sent", deduplicated: false };
  }

  async status(providerId: string): Promise<DeliveryStatus | null> {
    const row = await this.messages.findUnique({ where: { id: providerId } });
    if (!row) return null;
    const updatedAt = row.readAt ?? row.deliveredAt ?? row.createdAt;
    return { providerId, state: deliveryStateOf(row), updatedAt: new Date(updatedAt).toISOString() };
  }

  async inboundWebhook(): Promise<InboundMessageEvent[]> {
    return []; // in-app has no inbound channel
  }
}
