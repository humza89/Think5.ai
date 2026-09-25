"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";


import { CANDIDATE_NAV_SECTIONS as NAV_SECTIONS } from "@/components/layout/nav-config";
import { LogoMark } from "@/components/brand/LogoMark";

interface CandidateMobileSidebarProps {
  open: boolean;
  onClose: () => void;
}

export function CandidateMobileSidebar({ open, onClose }: CandidateMobileSidebarProps) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/candidate/dashboard") return pathname === "/candidate/dashboard";
    return pathname.startsWith(href);
  };

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="left" className="w-72 p-0">
        <SheetHeader className="p-4 border-b border-border">
          <SheetTitle className="flex items-center gap-2">
            <LogoMark size={32} />
            <span className="text-lg font-semibold">Think5</span>
          </SheetTitle>
        </SheetHeader>
        <nav className="p-2 space-y-4" aria-label="Mobile navigation">
          {NAV_SECTIONS.map((section, si) => (
            <div key={si}>
              {section.title && (
                <p className="px-3 mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {section.title}
                </p>
              )}
              <div className="space-y-1">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onClose}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                        active
                          ? "bg-blue-600/10 text-blue-600"
                          : "text-muted-foreground hover:bg-accent hover:text-foreground"
                      )}
                      aria-current={active ? "page" : undefined}
                    >
                      <Icon className="h-5 w-5 shrink-0" />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
