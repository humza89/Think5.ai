import Image from "next/image";
import { cn } from "@/lib/utils";

interface AriaPortraitProps {
  /** Rendered size in px (circle). */
  size?: number;
  className?: string;
}

/** Aria, Think5's AI interviewer: circular crop of her portrait. */
export function AriaPortrait({ size = 64, className }: AriaPortraitProps) {
  return (
    <span
      className={cn("relative inline-block shrink-0 overflow-hidden rounded-full bg-[#e6e8ff] ring-1 ring-ink/10", className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label="Aria, AI interviewer"
    >
      <Image
        src="/uploads/Emma.png"
        alt=""
        fill
        sizes={`${size}px`}
        className="object-cover object-top scale-[1.25] translate-y-[8%]"
        unoptimized
      />
    </span>
  );
}

export default AriaPortrait;
