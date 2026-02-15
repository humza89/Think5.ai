import Link from "next/link";
import Image from "next/image";
import { prisma } from "@/lib/prisma";
import { pickAvatar } from "@/lib/candidate-image";

export const dynamic = "force-dynamic";

async function load() {
  return prisma.candidate.findMany({
    orderBy: { updatedAt: "desc" },
    take: 50,
  });
}

export default async function DevCandidatesPage() {
  const rows = await load();
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">Dev: Recent Candidates</h1>
      <p className="text-sm text-gray-600">Quick sanity check that LinkedIn imports are real.</p>
      <div className="grid gap-3">
        {rows.map(c => (
          <Link href={`/candidates/${c.id}`} key={c.id}
                className="flex items-center gap-4 p-3 bg-white border rounded hover:bg-gray-50">
            <div className="h-10 w-10 rounded-full overflow-hidden bg-gray-100 ring-1 ring-gray-200">
              {pickAvatar(c) ? (
                <Image src={pickAvatar(c)} alt={c.fullName} width={40} height={40} className="h-full w-full object-cover" unoptimized />
              ) : <div className="h-full w-full bg-gray-200" />}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{c.fullName}</div>
              <div className="text-xs text-gray-600 truncate">{c.headline || 'No headline'}</div>
            </div>
            <div className="ml-auto text-xs text-gray-500">{new Date(c.updatedAt).toLocaleString()}</div>
          </Link>
        ))}
        {!rows.length && <div className="text-sm text-gray-600">No candidates yet. Try importing a LinkedIn profile, then refresh.</div>}
      </div>
    </div>
  );
}
