/**
 * Single navigation config for desktop and mobile sidebars (Phase 0 T10).
 * The recruiter and candidate shells each render exactly this; the mobile
 * drawers used to carry their own shorter, drifting copies.
 */
import {
  LayoutDashboard,
  Briefcase,
  Users,
  MessageSquare,
  BarChart3,
  UserSearch,
  Settings,
  Building2,
  Kanban,
  Search,
  UserPlus,
  FolderOpen,
  UsersRound,
  Mail,
  Home,
  Send,
  ClipboardList,
  User,
  Sparkles,
  Wrench,
  FileText,
  Bell,
  ShieldCheck,
  Mic,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  /** When set, only these profile roles see the item. */
  roles?: string[];
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}

export const RECRUITER_NAV_SECTIONS: NavSection[] = [
  {
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { label: "Jobs", href: "/jobs", icon: Briefcase },
      { label: "Pipeline", href: "/pipeline", icon: Kanban },
      { label: "Candidates", href: "/candidates", icon: Users, roles: ["recruiter"] },
      { label: "Search", href: "/search", icon: Search, roles: ["recruiter"] },
      { label: "Source", href: "/source", icon: UserPlus, roles: ["recruiter"] },
      { label: "Invitations", href: "/invitations", icon: Mail, roles: ["recruiter"] },
      { label: "Interviews", href: "/interviews", icon: MessageSquare },
      { label: "Clients", href: "/clients", icon: Building2, roles: ["recruiter"] },
    ],
  },
  {
    title: "Collaborate",
    items: [
      { label: "Messaging", href: "/messaging", icon: MessageSquare },
      { label: "Team", href: "/team", icon: UsersRound, roles: ["recruiter"] },
      { label: "Talent Pools", href: "/talent-pools", icon: FolderOpen, roles: ["recruiter"] },
    ],
  },
  {
    title: "Insights",
    items: [
      { label: "Analytics", href: "/analytics", icon: BarChart3 },
      { label: "Passive Profiles", href: "/passive-profiles", icon: UserSearch, roles: ["recruiter"] },
    ],
  },
  {
    title: "Management",
    items: [{ label: "Settings", href: "/settings", icon: Settings }],
  },
];

export const CANDIDATE_NAV_SECTIONS: NavSection[] = [
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
      { label: "Practice", href: "/candidate/practice", icon: Mic },
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
      { label: "Policies", href: "/candidate/policy", icon: ShieldCheck },
    ],
  },
];

/** Items a profile may see (role-gated items filtered). */
export function visibleSections(sections: NavSection[], role: string | null | undefined): NavSection[] {
  return sections
    .map((s) => ({ ...s, items: s.items.filter((i) => !i.roles || (role ? i.roles.includes(role) : false)) }))
    .filter((s) => s.items.length > 0);
}
