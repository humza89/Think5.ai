/**
 * Inngest Client
 *
 * Central client for durable, queue-backed job processing.
 * Replaces fire-and-forget in-process execution with retryable,
 * observable, dead-letter-capable job infrastructure.
 */

import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: "think5-interviews",
});
