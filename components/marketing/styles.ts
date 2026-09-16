/**
 * Shared class strings for marketing buttons. Plain module (no "use client")
 * so both server and client components can import it.
 */
export const pill = {
  ink: "inline-flex h-12 items-center justify-center gap-2 rounded-full bg-ink px-6 text-[15px] font-medium text-white transition-colors hover:bg-ink-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2",
  paper: "inline-flex h-12 items-center justify-center gap-2 rounded-full bg-white px-6 text-[15px] font-medium text-ink transition-colors hover:bg-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-ink",
  ghostLight: "inline-flex h-12 items-center justify-center gap-2 rounded-full border border-stone bg-transparent px-6 text-[15px] font-medium text-ink transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
  ghostDark: "inline-flex h-12 items-center justify-center gap-2 rounded-full border border-white/20 bg-transparent px-6 text-[15px] font-medium text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
  brand: "inline-flex h-12 items-center justify-center gap-2 rounded-full bg-brand px-6 text-[15px] font-medium text-white transition-colors hover:bg-[#1732d6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2",
};

