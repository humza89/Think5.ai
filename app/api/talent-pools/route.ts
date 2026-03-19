import { NextRequest, NextResponse } from 'next/server';
import { requireApprovedAccess, handleAuthError } from '@/lib/auth';

// Talent pools are stored as a JSON structure for Phase 1
// In Phase 2, this will be backed by a dedicated TalentPool model
const talentPools: Map<string, { id: string; name: string; description: string; candidateIds: string[]; createdAt: string; recruiterId: string }> = new Map();

export async function GET() {
  try {
    await requireApprovedAccess(['recruiter', 'admin']);

    const pools = Array.from(talentPools.values());
    return NextResponse.json({ pools });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireApprovedAccess(['recruiter', 'admin']);

    const body = await request.json();
    const { name, description } = body;

    if (!name) {
      return NextResponse.json({ error: 'Pool name is required' }, { status: 400 });
    }

    const id = crypto.randomUUID();
    const pool = {
      id,
      name,
      description: description || '',
      candidateIds: [],
      createdAt: new Date().toISOString(),
      recruiterId: user.id,
    };

    talentPools.set(id, pool);

    return NextResponse.json({ pool }, { status: 201 });
  } catch (error) {
    const { error: message, status } = handleAuthError(error);
    return NextResponse.json({ error: message }, { status });
  }
}
