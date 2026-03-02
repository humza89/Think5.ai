import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser, handleAuthError } from '@/lib/auth';

export async function GET() {
  try {
    const { user, profile } = await getAuthenticatedUser();
    if (profile?.role !== 'candidate') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Find candidate record by email
    const candidate = await prisma.candidate.findFirst({
      where: { email: user.email },
    });

    if (!candidate) {
      return NextResponse.json({ skills: [] });
    }

    const skills = await prisma.candidateSkill.findMany({
      where: { candidateId: candidate.id },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ skills });
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
    const { skillName, category, proficiency, yearsExp } = body;

    if (!skillName) {
      return NextResponse.json({ error: 'Skill name is required' }, { status: 400 });
    }

    const candidate = await prisma.candidate.findFirst({
      where: { email: user.email },
    });

    if (!candidate) {
      return NextResponse.json({ error: 'Candidate profile not found' }, { status: 404 });
    }

    const skill = await prisma.candidateSkill.create({
      data: {
        candidateId: candidate.id,
        skillName,
        category: category || null,
        proficiency: proficiency || null,
        yearsExp: yearsExp || null,
        source: 'manual',
      },
    });

    return NextResponse.json({ skill }, { status: 201 });
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
    const skillId = url.searchParams.get('id');

    if (!skillId) {
      return NextResponse.json({ error: 'Skill ID is required' }, { status: 400 });
    }

    const candidate = await prisma.candidate.findFirst({
      where: { email: user.email },
    });

    if (!candidate) {
      return NextResponse.json({ error: 'Candidate profile not found' }, { status: 404 });
    }

    // Verify skill belongs to this candidate
    const skill = await prisma.candidateSkill.findFirst({
      where: { id: skillId, candidateId: candidate.id },
    });

    if (!skill) {
      return NextResponse.json({ error: 'Skill not found' }, { status: 404 });
    }

    await prisma.candidateSkill.delete({ where: { id: skillId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}
