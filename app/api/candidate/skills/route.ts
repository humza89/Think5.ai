import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole, handleAuthError } from '@/lib/auth';

export async function GET() {
  try {
    const { user } = await requireRole(['candidate']);

    // Find candidate record by email
    const candidate = await prisma.candidate.findFirst({
      where: { email: user.email },
    });

    if (!candidate) {
      return NextResponse.json({ skills: [] });
    }

    const rawSkills = await prisma.candidateSkill.findMany({
      where: { candidateId: candidate.id },
      orderBy: { createdAt: 'desc' },
    });

    const skills = rawSkills.map((s) => ({
      id: s.id,
      name: s.skillName || 'Unknown',
      category: s.category || 'Other',
      proficiency: s.proficiency || 0,
      yearsOfExperience: s.yearsExp || 0,
    }));

    return NextResponse.json({ skills });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRole(['candidate']);

    const body = await request.json();
    const skillName = body.skillName || body.name;
    const category = body.category;
    const proficiency = body.proficiency;
    const yearsExp = body.yearsExp ?? body.yearsOfExperience;

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
    const { user } = await requireRole(['candidate']);

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
