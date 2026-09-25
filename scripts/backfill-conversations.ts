/**
 * Phase 0 T8 backfill: create a Conversation row for every distinct legacy
 * Message.conversationId (sorted participant ids joined by "-").
 * Idempotent and resumable: existing rows are left untouched.
 *
 *   npx tsx scripts/backfill-conversations.ts [--batch 500] [--dry-run]
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const batch = Number(args[args.indexOf("--batch") + 1]) || 500;

async function main(): Promise<void> {
  const groups = await prisma.message.groupBy({
    by: ["conversationId"],
    _max: { createdAt: true },
    _count: { _all: true },
  });
  console.log(`[backfill] ${groups.length} legacy conversation keys`);
  let created = 0;
  let skipped = 0;
  for (let i = 0; i < groups.length; i += batch) {
    const slice = groups.slice(i, i + batch);
    for (const group of slice) {
      const existing = await prisma.conversation.findUnique({ where: { id: group.conversationId } });
      if (existing) {
        skipped++;
        continue;
      }
      const first = await prisma.message.findFirst({ where: { conversationId: group.conversationId }, orderBy: { createdAt: "asc" } });
      const last = await prisma.message.findFirst({ where: { conversationId: group.conversationId }, orderBy: { createdAt: "desc" } });
      if (!first || !last) continue;
      const [aId, bId] = [first.senderId, first.recipientId].sort();
      const roleOf = (id: string) => (id === first.senderId ? first.senderRole : first.recipientRole);
      if (!dryRun) {
        await prisma.conversation.create({
          data: {
            id: group.conversationId,
            participantAId: aId,
            participantARole: roleOf(aId),
            participantBId: bId,
            participantBRole: roleOf(bId),
            lastMessageAt: last.createdAt,
            lastMessage: last.content,
          },
        });
      }
      created++;
    }
    console.log(`[backfill] ${Math.min(i + batch, groups.length)}/${groups.length} processed (created ${created}, skipped ${skipped})`);
  }
  console.log(`[backfill] done: created ${created}, skipped ${skipped}${dryRun ? " (dry run)" : ""}`);
}

main()
  .catch((error: unknown) => {
    console.error("[backfill] failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
