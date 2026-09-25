/**
 * T10: every visible stub in the plan's table is implemented, labelled
 * read-only, or removed. Source-level guards so a "coming soon" control
 * cannot quietly return.
 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CANDIDATE_NAV_SECTIONS, RECRUITER_NAV_SECTIONS, visibleSections } from "@/components/layout/nav-config";

const read = (p: string) => readFileSync(p, "utf8");

describe("T10: no dead-end controls", () => {
  it("settings notifications and API keys are wired to real routes", () => {
    const notifications = read("app/(dashboard)/settings/notifications/page.tsx");
    expect(notifications).toContain("/api/account/notification-preferences");
    expect(notifications).not.toMatch(/Simulate saving/);
    const apiKeys = read("app/(dashboard)/settings/api-keys/page.tsx");
    expect(apiKeys).toContain("/api/account/api-keys");
    expect(apiKeys).not.toMatch(/pk_live_xxxx|Simulate API key/);
    expect(existsSync("app/api/account/api-keys/route.ts")).toBe(true);
    expect(existsSync("lib/api-key-auth.ts")).toBe(true);
    expect(read("prisma/schema.prisma")).toMatch(/^model ApiKey \{/m);
  });

  it("settings profile points at the recruiter profile page", () => {
    expect(read("app/(dashboard)/settings/page.tsx")).toContain('href: "/settings/profile"');
    expect(existsSync("app/(dashboard)/settings/profile/page.tsx")).toBe(true);
    expect(existsSync("app/api/recruiter/profile/route.ts")).toBe(true);
  });

  it("candidates list has no Save / Project / Hide placeholders", () => {
    const page = read("app/(dashboard)/candidates/page.tsx");
    expect(page).not.toMatch(/handleSave\(|handleAddToProject\(|handleHide\(/);
    expect(page).not.toMatch(/toast\.info\("Coming soon"\)/);
  });

  it("source page invites through the InvitationModal", () => {
    const page = read("app/(dashboard)/source/page.tsx");
    expect(page).toContain("InvitationModal");
    expect(page).not.toMatch(/Invitation feature coming soon/);
  });

  it("clients: Add Role opens the existing dialog and View Matches is wired", () => {
    const list = read("app/(dashboard)/clients/page.tsx");
    const detail = read("app/(dashboard)/clients/[id]/page.tsx");
    expect(detail).not.toMatch(/\/roles\/new/);
    expect(detail).toContain("?addRole=");
    expect(list).toContain('searchParams.get("addRole")');
    expect(list).not.toMatch(/<Button variant="outline" size="sm">\s*View Matches/);
    expect(detail).toMatch(/setOpenMatches/);
  });

  it("hm-memberships reads companies from /api/clients", () => {
    const page = read("app/(dashboard)/admin/hm-memberships/page.tsx");
    expect(page).toContain('apiFetch("/api/clients")');
    expect(page).not.toContain('"/api/companies"');
  });

  it("/interviews/[id] redirects to the report", () => {
    expect(read("app/(dashboard)/interviews/[id]/page.tsx")).toMatch(/redirect\(`\/interviews\/\$\{id\}\/report`\)/);
  });

  it("global pipeline is labelled read-only and has no drag affordance", () => {
    const page = read("app/(dashboard)/pipeline/page.tsx");
    expect(page).not.toContain("GripVertical");
    expect(page).toContain("pipeline-readonly-badge");
  });

  it("talent pool cards are not clickable and say why", () => {
    const page = read("app/(dashboard)/talent-pools/page.tsx");
    expect(page).toContain("Detail view arrives with Talent CRM");
    expect(page).not.toMatch(/cursor-pointer/);
  });

  it("candidate Activity is a real tab and Emails is gone", () => {
    expect(read("components/candidate/TabsNav.tsx")).toContain('slug: "activity"');
    expect(read("app/(dashboard)/candidates/[id]/activity/page.tsx")).toContain("/api/candidates/${id}/activity");
    expect(existsSync("app/(dashboard)/candidates/[id]/emails")).toBe(false);
  });

  it("career tools keeps only working tools", () => {
    const page = read("app/candidate/career-tools/page.tsx");
    expect(page).not.toMatch(/comingSoon: true/);
  });

  it("practice is in the candidate nav and both shells share one nav config", () => {
    expect(CANDIDATE_NAV_SECTIONS.flatMap((s) => s.items).some((i) => i.href === "/candidate/practice")).toBe(true);
    for (const file of ["components/layout/DashboardSidebar.tsx", "components/layout/MobileSidebar.tsx", "components/layout/CandidateSidebar.tsx", "components/layout/CandidateMobileSidebar.tsx"]) {
      const src = read(file);
      expect(src, file).toContain("@/components/layout/nav-config");
      expect(src, file).not.toMatch(/const NAV_(SECTIONS|ITEMS)\s*[:=]/);
    }
    const recruiterOnly = visibleSections(RECRUITER_NAV_SECTIONS, "recruiter").flatMap((s) => s.items).map((i) => i.href);
    const hmOnly = visibleSections(RECRUITER_NAV_SECTIONS, "hiring_manager").flatMap((s) => s.items).map((i) => i.href);
    expect(recruiterOnly).toContain("/candidates");
    expect(hmOnly).not.toContain("/candidates");
    expect(hmOnly).toContain("/dashboard");
  });

  it("candidate policy reads the candidate-safe retention summary", () => {
    expect(read("app/candidate/policy/page.tsx")).toContain("/api/candidate/retention-summary");
    expect(existsSync("app/api/candidate/retention-summary/route.ts")).toBe(true);
  });

  it("text logo tiles are replaced by LogoMark", () => {
    for (const file of ["components/layout/DashboardSidebar.tsx", "components/layout/MobileSidebar.tsx", "components/layout/CandidateSidebar.tsx", "components/layout/CandidateMobileSidebar.tsx", "components/layout/CandidateLayout.tsx", "components/layout/DashboardLayout.tsx", "components/layout/AdminSidebar.tsx", "components/layout/AdminLayout.tsx", "app/recruiter/onboarding/page.tsx", "components/recruiter-onboarding/RecruiterOnboardingWizard.tsx"]) {
      const src = read(file);
      expect(src, file).not.toMatch(/font-bold text-sm">(T5|P|A)</);
      expect(src, file).toContain("<LogoMark");
    }
  });
});
