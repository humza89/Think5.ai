import Image from "next/image";
import { Clock, Mic } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { cn } from "@/lib/utils";

/**
 * Aria: the candidate's view of a live AI interview, drawn in HTML/CSS.
 * Video-call framing: Aria front and centre, timer, live caption with a
 * recording indicator, and the candidate's own camera picture-in-picture.
 */
export function AriaMock({ className }: { className?: string }) {
  return (
    <div className={cn("relative", className)}>
      <div className="relative aspect-[16/10] overflow-hidden rounded-2xl border border-stone bg-[#ece9e1] shadow-[0_40px_100px_-30px_rgba(10,10,11,0.45)] [contain:inline-size]">
        {/* Studio: warm paper room with a soft blue key light behind Aria */}
        <div
          className="absolute inset-0"
          aria-hidden="true"
          style={{
            background:
              "radial-gradient(60% 70% at 40% 42%, rgba(31,61,255,0.16) 0%, rgba(31,61,255,0) 70%), linear-gradient(180deg, #f3f1ea 0%, #e6e2d8 100%)",
          }}
        />
        <div className="dot-grid-light absolute inset-0 opacity-30 [mask-image:linear-gradient(to_bottom,black,transparent_60%)]" aria-hidden="true" />

        {/* Aria: left of centre so the caption sits clear on the right */}
        <div className="absolute bottom-0 left-0 right-[22%] top-[8%] [mask-image:radial-gradient(ellipse_62%_100%_at_50%_100%,black_60%,transparent_100%)]">
          <Image
            src="/uploads/Emma.png"
            alt="Aria, Think5's AI interviewer"
            fill
            sizes="(min-width: 1024px) 560px, 80vw"
            className="object-contain object-bottom mix-blend-multiply"
            unoptimized
          />
        </div>

        {/* Top bar */}
        <div className="absolute inset-x-0 top-0 flex items-center justify-between px-4 py-3 md:px-5">
          <Logo tone="dark" href={null} className="scale-90 origin-left" />
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-stone bg-paper-2/85 px-2.5 py-1 text-[11px] font-medium tabular-nums text-ink backdrop-blur">
            <Clock className="h-3 w-3" /> 29:59
          </span>
        </div>

        {/* Caption + recording */}
        <div className="absolute right-4 top-[44%] w-[30%] max-w-[220px] md:right-6">
          <p className="text-[11px] leading-relaxed text-ink md:text-[12px]">
            Hello! I&apos;m Aria, Think5&apos;s AI interviewer. Welcome, I&apos;m excited to get to know you. Could
            you briefly introduce yourself?
          </p>
          <div className="mt-3 flex h-8 items-center justify-center gap-2 rounded-lg border border-stone bg-paper-2/90 text-[11px] font-medium text-ink backdrop-blur">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
            </span>
            Recording
          </div>
        </div>

        {/* Candidate picture-in-picture */}
        <div className="absolute bottom-3 left-3 w-[34%] max-w-[200px] overflow-hidden rounded-xl border-2 border-paper-2 bg-ink shadow-[0_16px_40px_-16px_rgba(10,10,11,0.6)] md:bottom-4 md:left-4">
          <div className="relative aspect-[4/3]">
            <img
              src="https://images.unsplash.com/photo-1702669010463-3f2088abc0e9?w=480&h=360&fit=crop&crop=faces"
              alt="Candidate camera view"
              className="absolute inset-0 h-full w-full object-cover"
            />
            <span className="absolute bottom-1.5 right-1.5 inline-flex items-center gap-1 rounded-md bg-ink/70 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur">
              <Mic className="h-2.5 w-2.5" /> You
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AriaMock;
