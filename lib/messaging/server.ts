/**
 * Server-side wiring for the messaging service: real Prisma, Supabase
 * profiles lookup, Redis pubsub wake-ups, and the authenticated actor.
 */
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase-server";
import { publishNotification } from "@/lib/notification-pubsub";
import type { Actor, MessagingDeps, ProfileLookup, ProfileRecord } from "./service";
import { recordUsage } from "@/lib/usage/meter";

const lookupProfiles: ProfileLookup = async ({ ids, emails }) => {
  const admin = await createSupabaseAdminClient();
  let query = admin.from("profiles").select("id, email, first_name, last_name, role");
  if (ids && ids.length > 0) query = query.in("id", ids);
  else if (emails && emails.length > 0) query = query.in("email", emails);
  else return [];
  const { data } = await query;
  return (data ?? []) as ProfileRecord[];
};

export function messagingDeps(): MessagingDeps {
  return {
    db: prisma,
    profiles: lookupProfiles,
    publish: (recipientId, messageId) => publishNotification(recipientId, `msg:${messageId}`),
    recordUsage,
  };
}

export async function messagingActor(): Promise<Actor> {
  const { user, profile } = await getAuthenticatedUser();
  let tenantId: string | null = null;
  if (profile.role === "recruiter") {
    const recruiter = await prisma.recruiter.findUnique({ where: { supabaseUserId: user.id }, select: { companyId: true } });
    tenantId = recruiter?.companyId ?? null;
  }
  return { id: user.id, email: profile.email, role: profile.role, tenantId };
}
