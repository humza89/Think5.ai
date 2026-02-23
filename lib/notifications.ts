import { prisma } from "./prisma";

type NotificationType =
  | "INTERVIEW_INVITE"
  | "APPLICATION_UPDATE"
  | "MATCH_ALERT"
  | "FEEDBACK_READY"
  | "SYSTEM";

export async function createNotification({
  userId,
  candidateId,
  type,
  title,
  message,
  data,
}: {
  userId: string;
  candidateId?: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: any;
}) {
  return prisma.notification.create({
    data: {
      userId,
      candidateId,
      type,
      title,
      message,
      data,
    },
  });
}

export async function getUnreadCount(userId: string): Promise<number> {
  return prisma.notification.count({
    where: { userId, read: false },
  });
}
