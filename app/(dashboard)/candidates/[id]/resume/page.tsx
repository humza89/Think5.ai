import { prisma } from "@/lib/prisma";
import ResumeUpload from "./ResumeUpload";

export const dynamic = "force-dynamic";

export default async function ResumeTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const candidate = await prisma.candidate.findUnique({
    where: { id },
  });

  if (!candidate) return null;

  const resumeUrl = (candidate as any)?.resumeUrl;

  return (
    <div className="-m-6 h-full">
      <div className="bg-white h-full flex flex-col">
        <div className="px-6 py-4 border-b flex items-center justify-between flex-shrink-0">
          <h3 className="font-semibold text-lg">Resume</h3>
          <ResumeUpload candidateId={id} hasResume={!!resumeUrl} />
        </div>
        <div className="flex-1 overflow-hidden bg-gray-100">
          {!resumeUrl ? (
            <div className="text-center py-12">
              <div className="text-4xl mb-4">📄</div>
              <p className="text-sm text-gray-600 mb-4">No resume uploaded</p>
              <p className="text-xs text-gray-500">
                Upload a resume to automatically extract candidate information
              </p>
            </div>
          ) : (
            <object
              data={`${resumeUrl}#toolbar=0&navpanes=0&scrollbar=1`}
              type="application/pdf"
              className="w-full h-full"
              style={{ minHeight: 'calc(100vh - 200px)' }}
            >
              <embed
                src={`${resumeUrl}#toolbar=0&navpanes=0&scrollbar=1`}
                type="application/pdf"
                className="w-full h-full"
                style={{ minHeight: 'calc(100vh - 200px)' }}
              />
            </object>
          )}
        </div>
      </div>
    </div>
  );
}
