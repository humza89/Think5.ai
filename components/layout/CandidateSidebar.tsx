"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Home,
  Search,
  Send,
  ClipboardList,
  User,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Wrench,
  FileText,
  MessageSquare,
  Bell,
  Settings,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/layout/ThemeToggle";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
}

const NAV_SECTIONS: { title?: string; items: NavItem[] }[] = [
  {
    items: [
      { label: "Dashboard", href: "/candidate/dashboard", icon: Home },
      { label: "Browse Jobs", href: "/candidate/jobs", icon: Search },
      { label: "Applications", href: "/candidate/applications", icon: Send },
      { label: "Interviews", href: "/candidate/interviews", icon: ClipboardList },
      { label: "Profile", href: "/candidate/profile", icon: User },
    ],
  },
  {
    title: "Growth",
    items: [
      { label: "Skills", href: "/candidate/skills", icon: Sparkles },
      { label: "Career Tools", href: "/candidate/career-tools", icon: Wrench },
      { label: "Documents", href: "/candidate/documents", icon: FileText },
    ],
  },
  {
    title: "Connect",
    items: [
      { label: "Messages", href: "/candidate/messaging", icon: MessageSquare },
      { label: "Notifications", href: "/candidate/notifications", icon: Bell },
      { label: "Settings", href: "/candidate/settings", icon: Settings },
    ],
  },
];

interface CandidateSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function CandidateSidebar({ collapsed, onToggle }: CandidateSidebarProps) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/candidate/dashboard") return pathname === "/candidate/dashboard";
    return pathname.startsWith(href);
  };

  return (
    <aside
      className={cn(
        "hidden md:flex flex-col h-full bg-card border-r border-border transition-all duration-200",
        collapsed ? "w-16" : "w-60"
      )}
    >
      {/* Logo */}
      <div className={cn("flex items-center h-14 px-4 border-b border-border", collapsed && "justify-center")}>
        <Link href="/candidate/dashboard" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
            <span className="text-white font-bold text-sm">T5</span>
          </div>
          {!collapsed && (
            <span className="text-lg font-semibold text-foreground">Think5</span>
          )}
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-6" aria-label="Candidate navigation">
        {NAV_SECTIONS.map((section, si) => (
          <div key={si}>
            {section.title && !collapsed && (
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
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      active
                        ? "bg-blue-600/10 text-blue-600"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground",
                      collapsed && "justify-center px-2"
                    )}
                    title={collapsed ? item.label : undefined}
                    aria-current={active ? "page" : undefined}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    {!collapsed && <span>{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Theme Toggle & Collapse Toggle */}
      <div className="p-2 border-t border-border space-y-1">
        <div className={cn("flex items-center", collapsed ? "justify-center" : "px-1")}>
          <ThemeToggle />
          {!collapsed && (
            <span className="ml-2 text-sm text-muted-foreground">Toggle theme</span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggle}
          className="w-full justify-center"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>
    </aside>
  );
}
