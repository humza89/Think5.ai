import fs from "node:fs";
import { test, expect, BrowserContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { E2E_FIXTURES, STORAGE_STATE_PATHS } from "../fixtures/e2e-fixtures";

/**
 * Plan spec `share-link.spec`: the email-gated shared report.
 *
 * A recruiter shares the seeded completed interview's report with a
 * recipient email. Anonymously: the data endpoint is gated, the share page
 * shows the email gate, a wrong email is refused, the right email (any case)
 * sets the HMAC-signed `report-access-{token}` cookie (#39) and the data is
 * served without the recipient email; revoking ends access. The report row is
 * created here and removed at the end so the visual captures and the other
 * writes specs see the seeded state unchanged.
 */
const fixturesRequired = process.env.E2E_AUTH_FIXTURES === "true";
const recruiterStorage =
  process.env.E2E_RECRUITER_STORAGE_STATE ?? (fs.existsSync(STORAGE_STATE_PATHS.recruiter) ? STORAGE_STATE_PATHS.recruiter : undefined);

async function csrf(context: BrowserContext): Promise<Record<string, string>> {
  const cookie = (await context.cookies()).find((c) => c.name === "csrf-token-client");
  if (!cookie) throw new Error("csrf-token-client cookie missing from the context");
  return { "x-csrf-token": cookie.value, "Content-Type": "application/json" };
}

const RECIPIENT = "reviewer@example.com";

test("recruiter shares a report behind an email gate; verification issues the HMAC cookie; revoke ends access", async ({ browser }) => {
  test.skip(!fixturesRequired && !recruiterStorage, "requires recruiter storage state");
  test.skip(!process.env.DATABASE_URL, "requires DATABASE_URL for the report fixture");
  test.setTimeout(120_000);

  const prisma = new PrismaClient();
  const interviewId = E2E_FIXTURES.ids.interviewCompleted;
  const recruiter = await browser.newContext({ storageState: recruiterStorage! });
  const anonymous = await browser.newContext();
  try {
    // Fixture: a durable report for the seeded completed interview (deleted below).
    await prisma.interviewReport.deleteMany({ where: { interviewId } });
    await prisma.interviewReport.create({
      data: {
        interviewId,
        technicalSkills: { rating: 4 },
        softSkills: { rating: 4 },
        summary: "Share-link golden fixture report.",
        strengths: ["Clear communication"],
        areasToImprove: ["Deeper system design"],
        recommendation: "HIRE",
        overallScore: 8.2,
      },
    });

    // 1. Recruiter creates the share link with a recipient email gate.
    const shared = await recruiter.request.post(`/api/interviews/${interviewId}/report/share`, {
      headers: await csrf(recruiter),
      data: { recipientEmail: RECIPIENT, purpose: "hiring committee", expiryDays: 7 },
    });
    expect(shared.status(), "share").toBe(200);
    const { shareToken, shareUrl } = (await shared.json()) as { shareToken: string; shareUrl: string };
    expect(shareToken).toBeTruthy();
    expect(shareUrl).toContain(`/reports/shared/${shareToken}`);

    // 2. Anonymous: data is gated, and the share page shows the email gate.
    const gated = await anonymous.request.get(`/api/reports/shared/${shareToken}/data`);
    expect(gated.status()).toBe(403);
    expect(await gated.json()).toMatchObject({ requiresEmailVerification: true });
    const page = await anonymous.newPage();
    await page.goto(`/reports/shared/${shareToken}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByPlaceholder("Enter your email address")).toBeVisible({ timeout: 30_000 });

    // 3. Wrong email is refused; the right email (any case) sets the cookie.
    const ah = await csrf(anonymous);
    const wrong = await anonymous.request.post(`/api/reports/shared/${shareToken}/verify-email`, { headers: ah, data: { email: "someone-else@example.com" } });
    expect(wrong.status()).toBe(403);
    const right = await anonymous.request.post(`/api/reports/shared/${shareToken}/verify-email`, { headers: ah, data: { email: "Reviewer@Example.COM" } });
    expect(right.status(), "verify-email").toBe(200);
    expect(await right.json()).toEqual({ verified: true });
    const accessCookie = (await anonymous.cookies()).find((c) => c.name === `report-access-${shareToken}`);
    expect(accessCookie, "HMAC access cookie set").toBeTruthy();
    expect(accessCookie!.value.split("."), "cookie format {expiry}.{ipPrefix}.{mac}").toHaveLength(3);
    expect(accessCookie!.httpOnly).toBe(true);

    // 4. With the cookie the data is served, without the recipient email.
    const served = await anonymous.request.get(`/api/reports/shared/${shareToken}/data`);
    expect(served.status(), "data with cookie").toBe(200);
    const body = (await served.json()) as Record<string, unknown>;
    expect(body.summary).toBe("Share-link golden fixture report.");
    expect(body).not.toHaveProperty("recipientEmail");
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByText("Share-link golden fixture report.")).toBeVisible({ timeout: 30_000 });

    // 5. Revoke: the link stops working even with the cookie.
    const revoked = await recruiter.request.delete(`/api/interviews/${interviewId}/report/share/revoke`, { headers: await csrf(recruiter) });
    expect(revoked.status(), "revoke").toBe(200);
    const after = await anonymous.request.get(`/api/reports/shared/${shareToken}/data`);
    expect([403, 404], "revoked link").toContain(after.status());
  } finally {
    await prisma.interviewReport.deleteMany({ where: { interviewId } }).catch(() => {});
    await prisma.$disconnect().catch(() => {});
    await anonymous.close();
    await recruiter.close();
  }
});
