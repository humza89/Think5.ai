import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole, getRecruiterForUser, handleAuthError } from '@/lib/auth';

export async function GET() {
  try {
    const { user, profile } = await requireRole(['recruiter', 'admin']);

    const recruiter = await getRecruiterForUser(
      user.id,
      profile.email,
      `${profile.first_name} ${profile.last_name}`
    );

    // Get all recruiters in the same company
    let teamMembers;
    if (recruiter.companyId) {
      teamMembers = await prisma.recruiter.findMany({
        where: { companyId: recruiter.companyId },
        select: {
          id: true,
          name: true,
          email: true,
          title: true,
          department: true,
          createdAt: true,
          _count: {
            select: {
              candidates: true,
              jobs: true,
              interviews: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      });
    } else {
      // Solo recruiter — just show themselves
      teamMembers = [{
        id: recruiter.id,
        name: recruiter.name,
        email: recruiter.email,
        title: recruiter.title,
        department: recruiter.department,
        createdAt: recruiter.createdAt,
        _count: await prisma.recruiter.findUnique({
          where: { id: recruiter.id },
          select: {
            _count: {
              select: { candidates: true, jobs: true, interviews: true },
            },
          },
        }).then((r: { _count: { candidates: number; jobs: number; interviews: number } } | null) => r?._count || { candidates: 0, jobs: 0, interviews: 0 }),
      }];
    }

    return NextResponse.json({ teamMembers });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}
