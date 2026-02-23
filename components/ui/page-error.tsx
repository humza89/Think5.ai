import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface PageErrorProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
  fullScreen?: boolean;
}

export function PageError({
  title = "Something went wrong",
  message = "We couldn't load this page. Please try again.",
  onRetry,
  className,
  fullScreen = true,
}: PageErrorProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-center",
        fullScreen && "min-h-screen",
        !fullScreen && "py-20",
        className
      )}
    >
      <Card className="p-8 text-center max-w-md">
        <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
        <h3 className="text-lg font-medium text-foreground mb-2">{title}</h3>
        <p className="text-sm text-muted-foreground mb-6">{message}</p>
        {onRetry && (
          <Button onClick={onRetry} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Try Again
          </Button>
        )}
      </Card>
    </div>
  );
}
