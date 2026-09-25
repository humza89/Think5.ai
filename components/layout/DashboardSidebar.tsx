"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/layout/ThemeToggle";

import { RECRUITER_NAV_SECTIONS as NAV_SECTIONS } from "@/components/layout/nav-config";
import { LogoMark } from "@/components/brand/LogoMark";

interface DashboardSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function DashboardSidebar({ collapsed, onToggle }: DashboardSidebarProps) {
  const pathname = usePathname();
  const { profile } = useAuth();

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
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
        <Link href="/dashboard" className="flex items-center gap-2">
          <LogoMark size={32} />
          {!collapsed && (
            <span className="text-lg font-semibold text-foreground">Think5</span>
          )}
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-6" aria-label="Main navigation">
        {NAV_SECTIONS.map((section, si) => (
          <div key={si}>
            {section.title && !collapsed && (
              <p className="px-3 mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {section.title}
              </p>
            )}
            <div className="space-y-1">
              {section.items
                .filter((item) => !item.roles || (profile && item.roles.includes(profile.role)))
                .map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                        active
                          ? "bg-primary/10 text-primary"
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
