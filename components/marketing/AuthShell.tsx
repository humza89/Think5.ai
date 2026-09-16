import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { LogoMark } from "@/components/brand/LogoMark";
import { cn } from "@/lib/utils";

interface AuthShellProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  backHref?: string;
  backLabel?: string;
  /** Large serif statement shown in the left pane. */
  quote?: React.ReactNode;
  attribution?: string;
  /** Widen the form column (sign-up). */
  wide?: boolean;
}

/** Shared input styling for auth forms (paper tone). */
export const authField =
  "h-12 rounded-xl border-stone bg-paper-2 text-[15px] text-ink placeholder:text-graphite/60 focus-visible:border-ink focus-visible:ring-0 focus-visible:ring-offset-0";

export const authButton =
  "inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-ink px-6 text-[15px] font-medium text-white transition-colors hover:bg-ink-2 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2";

export const authButtonGhost =
  "inline-flex h-12 w-full items-center justify-center gap-2 rounded-full border border-stone bg-transparent px-6 text-[15px] font-medium text-ink transition-colors hover:bg-paper-2 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";

export function AuthShell({
  title,
  subtitle,
  children,
  backHref = "/",
  backLabel = "Back to home",
  quote = (
    <>
      Where the world&apos;s sharpest minds meet the models that <span className="italic text-white/60">need</span> them.
    </>
  ),
  attribution = "Trusted by teams building frontier AI",
  wide = false,
}: AuthShellProps) {
  return (
    <div className="grid min-h-screen bg-paper lg:grid-cols-[5fr_7fr]">
      {/* Left: brand pane */}
      <aside className="relative hidden overflow-hidden bg-ink text-white lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="dot-grid absolute inset-0 opacity-50 [mask-image:radial-gradient(ellipse_at_bottom_left,black_10%,transparent_65%)]" aria-hidden="true" />
        <div className="relative">
          <Logo tone="light" withMark />
        </div>
        <div className="relative">
          <p className="max-w-md font-display text-[44px] leading-[1.05] tracking-[-0.02em]">{quote}</p>
        </div>
        <div className="relative flex items-center gap-3 text-[13px] text-white/50">
          <span className="h-1.5 w-1.5 rounded-full bg-brand" />
          {attribution}
        </div>
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-12 -right-6 select-none font-display text-[280px] leading-none tracking-[-0.05em] text-white/[0.03]">
          t.
        </div>
      </aside>

      {/* Right: form pane */}
      <main className="flex items-center justify-center px-6 py-16 md:px-12">
        <div className={cn("w-full", wide ? "max-w-lg" : "max-w-md")}>
          <div className="mb-10 flex items-center justify-between lg:hidden">
            <Logo tone="dark" withMark />
          </div>

          <Link href={backHref} className="inline-flex items-center gap-2 text-[13px] text-graphite transition-colors hover:text-ink">
            <ArrowLeft className="h-3.5 w-3.5" />
            {backLabel}
          </Link>

          <div className="mt-8 mb-8">
            <h1 className="font-display text-[40px] leading-[1.05] tracking-[-0.02em] text-ink md:text-[48px]">{title}</h1>
            {subtitle && <p className="mt-3 text-[15px] leading-relaxed text-graphite">{subtitle}</p>}
          </div>

          {children}
        </div>
      </main>
    </div>
  );
}

/** Centred status card used by verify / reset / success states. */
export function AuthNotice({
  icon,
  title,
  children,
  tone = "neutral",
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  children?: React.ReactNode;
  tone?: "neutral" | "success" | "error";
}) {
  return (
    <div className="rounded-[24px] border border-stone bg-paper-2 p-8 text-center">
      {icon && (
        <div
          className={cn(
            "mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full",
            tone === "success" && "bg-brand text-white",
            tone === "error" && "bg-red-50 text-red-600",
            tone === "neutral" && "bg-paper text-ink"
          )}
        >
          {icon}
        </div>
      )}
      <h2 className="font-display text-[32px] leading-tight tracking-[-0.01em] text-ink">{title}</h2>
      {children}
    </div>
  );
}

export function AuthError({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
      <p className="text-[14px] text-red-700">{children}</p>
    </div>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <span className="flex items-center gap-2">
      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" aria-hidden="true">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
      </svg>
      {label}
    </span>
  );
}

export { LogoMark as AuthLogoMark };
