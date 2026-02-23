import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface PageLoaderProps {
  message?: string;
  className?: string;
  fullScreen?: boolean;
}

export function PageLoader({
  message = "Loading...",
  className,
  fullScreen = true,
}: PageLoaderProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-center",
        fullScreen && "min-h-screen",
        !fullScreen && "py-20",
        className
      )}
    >
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}
