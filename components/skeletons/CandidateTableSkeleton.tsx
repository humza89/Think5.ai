import { Skeleton } from "@/components/ui/skeleton";

export function CandidateTableSkeleton() {
  return (
    <div className="max-w-[1800px] mx-auto px-6 py-6">
      {/* Title */}
      <div className="mb-4">
        <Skeleton className="h-7 w-44 mb-2" />
        <Skeleton className="h-4 w-80" />
      </div>

      {/* Filter bar */}
      <div className="mb-3 flex items-center gap-2 flex-wrap">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton
            key={i}
            className="h-8 rounded-md"
            style={{
              width: `${[110, 60, 80, 64, 72, 48, 68][i]}px`,
            }}
          />
        ))}
        {/* Search input */}
        <Skeleton className="h-8 w-48 rounded-md" />
        {/* More filters */}
        <Skeleton className="h-8 w-24 rounded-md" />
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
        {/* Table header bar */}
        <div className="border-b border-gray-200 px-5 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Skeleton className="h-4 w-4 rounded" />
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-6 w-28 rounded-md" />
            </div>
            <div className="flex items-center gap-3">
              <Skeleton className="h-4 w-24" />
              <div className="flex items-center gap-1">
                <Skeleton className="h-7 w-7 rounded-md" />
                <Skeleton className="h-7 w-7 rounded-md" />
              </div>
            </div>
          </div>
        </div>

        {/* Column headers */}
        <div className="grid grid-cols-12 gap-4 px-5 py-2.5 border-b border-gray-200 bg-gray-50/50">
          <div className="col-span-3">
            <Skeleton className="h-3 w-12" />
          </div>
          <div className="col-span-4">
            <Skeleton className="h-3 w-20" />
          </div>
          <div className="col-span-3">
            <Skeleton className="h-3 w-16" />
          </div>
          <div className="col-span-2" />
        </div>

        {/* Table rows */}
        <div className="divide-y divide-gray-100">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="grid grid-cols-12 gap-4 px-5 py-3.5"
            >
              {/* Name column */}
              <div className="col-span-3 flex items-start gap-3">
                <Skeleton className="h-4 w-4 mt-1 rounded" />
                <Skeleton className="h-12 w-12 rounded-full flex-shrink-0" />
                <div className="flex-1 min-w-0 space-y-1.5">
                  <Skeleton
                    className="h-4"
                    style={{ width: `${[120, 96, 140, 108, 132, 100, 116, 128][i]}px` }}
                  />
                  <Skeleton
                    className="h-3"
                    style={{ width: `${[100, 80, 110, 88, 96, 72, 104, 92][i]}px` }}
                  />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>

              {/* Experiences column */}
              <div className="col-span-4 space-y-2">
                {Array.from({ length: i % 2 === 0 ? 3 : 2 }).map((_, j) => (
                  <div key={j} className="flex items-start gap-2.5">
                    <Skeleton className="h-6 w-6 rounded flex-shrink-0" />
                    <div className="flex-1 min-w-0 space-y-1">
                      <Skeleton
                        className="h-3"
                        style={{ width: `${[100, 120, 88][j % 3]}px` }}
                      />
                      <Skeleton
                        className="h-3"
                        style={{ width: `${[140, 160, 120][j % 3]}px` }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Schools column */}
              <div className="col-span-3 space-y-2">
                {Array.from({ length: i % 3 === 0 ? 2 : 1 }).map((_, j) => (
                  <div key={j} className="flex items-start gap-2.5">
                    <Skeleton className="h-6 w-6 rounded flex-shrink-0" />
                    <div className="flex-1 min-w-0 space-y-1">
                      <Skeleton
                        className="h-3"
                        style={{ width: `${[96, 112][j % 2]}px` }}
                      />
                      <Skeleton
                        className="h-3"
                        style={{ width: `${[130, 110][j % 2]}px` }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Actions column */}
              <div className="col-span-2 flex flex-col gap-1.5">
                <Skeleton className="h-7 w-full rounded-md" />
                <Skeleton className="h-7 w-full rounded-md" />
                <Skeleton className="h-7 w-full rounded-md" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
