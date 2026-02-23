import { Skeleton } from "@/components/ui/skeleton";

const COLUMN_CARD_COUNTS = [4, 3, 2, 2, 3, 2];

export function KanbanSkeleton() {
  return (
    <div className="space-y-4">
      {/* Kanban columns */}
      <div className="overflow-x-auto pb-4 -mx-2 px-2">
        <div className="flex gap-3 min-w-max">
          {COLUMN_CARD_COUNTS.map((cardCount, colIdx) => (
            <div
              key={colIdx}
              className="flex flex-col rounded-xl border border-gray-200 bg-gray-50/80 min-w-[280px] w-[280px] flex-shrink-0"
            >
              {/* Column header */}
              <div className="flex items-center justify-between px-3 py-3 border-b border-gray-200/60">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-2.5 w-2.5 rounded-full" />
                  <Skeleton
                    className="h-4"
                    style={{
                      width: `${[52, 68, 80, 72, 52, 44][colIdx]}px`,
                    }}
                  />
                </div>
                <Skeleton className="h-5 w-5 rounded-md" />
              </div>

              {/* Cards area */}
              <div className="flex-1 p-2 space-y-2 min-h-[120px]">
                {Array.from({ length: cardCount }).map((_, cardIdx) => (
                  <div
                    key={cardIdx}
                    className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm"
                  >
                    <div className="flex items-start gap-2">
                      {/* Drag handle placeholder */}
                      <Skeleton className="h-4 w-4 mt-0.5 rounded flex-shrink-0 opacity-0" />

                      {/* Card content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          {/* Avatar */}
                          <Skeleton className="h-7 w-7 rounded-full flex-shrink-0" />
                          {/* Name */}
                          <Skeleton
                            className="h-4"
                            style={{
                              width: `${80 + ((colIdx * 3 + cardIdx * 7) % 60)}px`,
                            }}
                          />
                        </div>

                        {/* Title */}
                        <div className="pl-9 mb-1.5">
                          <Skeleton
                            className="h-3"
                            style={{
                              width: `${100 + ((colIdx * 5 + cardIdx * 11) % 80)}px`,
                            }}
                          />
                        </div>

                        {/* Footer: date + score */}
                        <div className="flex items-center justify-between pl-9">
                          <Skeleton className="h-3 w-12" />
                          {cardIdx % 2 === 0 && (
                            <Skeleton className="h-4 w-8 rounded-full" />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
