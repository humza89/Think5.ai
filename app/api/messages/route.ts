import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser, handleAuthError } from '@/lib/auth';

export async function GET() {
  try {
    const { user } = await getAuthenticatedUser();

    // Get all conversations for this user (as sender or recipient)
    const messages = await prisma.message.findMany({
      where: {
        OR: [
          { senderId: user.id },
          { recipientId: user.id },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });

    // Group by conversationId and get latest message per conversation
    const conversationMap = new Map<string, typeof messages[0]>();
    for (const msg of messages) {
      if (!conversationMap.has(msg.conversationId)) {
        conversationMap.set(msg.conversationId, msg);
      }
    }

    const conversations = Array.from(conversationMap.values()).map((msg) => ({
      conversationId: msg.conversationId,
      lastMessage: msg.content,
      lastMessageAt: msg.createdAt,
      isRead: msg.recipientId === user.id ? msg.read : true,
      participantId: msg.senderId === user.id ? msg.recipientId : msg.senderId,
      participantRole: msg.senderId === user.id ? msg.recipientRole : msg.senderRole,
    }));

    return NextResponse.json({ conversations });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, profile } = await getAuthenticatedUser();

    const body = await request.json();
    const { recipientId, content, conversationId } = body;

    if (!recipientId || !content) {
      return NextResponse.json(
        { error: 'Recipient and content are required' },
        { status: 400 }
      );
    }

    const senderRole = profile?.role === 'candidate' ? 'CANDIDATE' : 'RECRUITER';
    const recipientRole = senderRole === 'CANDIDATE' ? 'RECRUITER' : 'CANDIDATE';

    // Generate or use existing conversation ID
    const convId = conversationId || `${[user.id, recipientId].sort().join('-')}`;

    const message = await prisma.message.create({
      data: {
        conversationId: convId,
        senderId: user.id,
        senderRole,
        recipientId,
        recipientRole,
        content,
      },
    });

    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}
