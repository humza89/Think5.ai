import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser, handleAuthError } from '@/lib/auth';

export async function GET() {
  try {
    const { user, profile } = await getAuthenticatedUser();
    if (profile?.role !== 'candidate') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const candidate = await prisma.candidate.findFirst({
      where: { email: user.email },
    });

    if (!candidate) {
      return NextResponse.json({ documents: [] });
    }

    const documents = await prisma.document.findMany({
      where: { candidateId: candidate.id },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ documents });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, profile } = await getAuthenticatedUser();
    if (profile?.role !== 'candidate') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { fileUrl, filename, type, mimeType, fileSize } = body;

    if (!fileUrl || !filename) {
      return NextResponse.json({ error: 'fileUrl and filename are required' }, { status: 400 });
    }

    const candidate = await prisma.candidate.findFirst({
      where: { email: user.email },
    });

    if (!candidate) {
      return NextResponse.json({ error: 'Candidate profile not found' }, { status: 404 });
    }

    const document = await prisma.document.create({
      data: {
        candidateId: candidate.id,
        type: type || 'OTHER',
        fileUrl,
        filename,
        mimeType: mimeType || null,
        fileSize: fileSize || null,
      },
    });

    return NextResponse.json({ document }, { status: 201 });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { user, profile } = await getAuthenticatedUser();
    if (profile?.role !== 'candidate') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const url = new URL(request.url);
    const docId = url.searchParams.get('id');

    if (!docId) {
      return NextResponse.json({ error: 'Document ID is required' }, { status: 400 });
    }

    const candidate = await prisma.candidate.findFirst({
      where: { email: user.email },
    });

    if (!candidate) {
      return NextResponse.json({ error: 'Candidate profile not found' }, { status: 404 });
    }

    const doc = await prisma.document.findFirst({
      where: { id: docId, candidateId: candidate.id },
    });

    if (!doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    await prisma.document.delete({ where: { id: docId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}
