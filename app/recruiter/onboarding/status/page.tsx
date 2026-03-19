"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  Clock,
  CheckCircle2,
  XCircle,
  ArrowRight,
  RefreshCw,
} from "lucide-react";

interface OnboardingState {
  completed: boolean;
  onboardingStatus: string;
}

export default function RecruiterOnboardingStatusPage() {
  const router = useRouter();
  const [state, setState] = useState<OnboardingState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStatus() {
      try {
        const res = await fetch("/api/recruiter/onboarding");
        if (!res.ok) throw new Error("Failed to fetch");
        const data = await res.json();
        setState({
          completed: data.completed,
          onboardingStatus: data.onboardingStatus,
        });

        // If not completed, redirect to onboarding
        if (!data.completed) {
          router.replace("/recruiter/onboarding");
          return;
        }

        // If approved, redirect to dashboard
        if (data.onboardingStatus === "APPROVED") {
          router.replace("/dashboard");
          return;
        }
      } catch {
        // Allow page to render with error state
      } finally {
        setLoading(false);
      }
    }
    fetchStatus();
  }, [router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Checking your status...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <span className="text-2xl font-bold text-foreground">Think5</span>
          <span className="text-2xl font-bold text-primary">.</span>
        </div>

        {state?.onboardingStatus === "PENDING_APPROVAL" && <PendingCard />}
        {state?.onboardingStatus === "REJECTED" && <RejectedCard />}
        {state?.onboardingStatus === "APPROVED" && <ApprovedCard />}

        {!state && (
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-muted-foreground">
                Unable to load your status. Please try refreshing the page.
              </p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => window.location.reload()}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function PendingCard() {
  return (
    <Card className="border-yellow-200/50 dark:border-yellow-800/30">
      <CardContent className="p-8">
        <div className="flex flex-col items-center text-center">
          <div className="relative mb-6">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-yellow-100 dark:bg-yellow-900/30">
              <Clock className="h-8 w-8 text-yellow-600 dark:text-yellow-400" />
            </div>
            <span className="absolute -right-1 -top-1 flex h-4 w-4">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-yellow-400 opacity-75"></span>
              <span className="relative inline-flex h-4 w-4 rounded-full bg-yellow-500"></span>
            </span>
          </div>

          <h2 className="text-xl font-semibold text-foreground mb-2">
            Your account is under review
          </h2>
          <p className="text-muted-foreground mb-6 max-w-sm">
            Thank you for completing your setup! Our team is currently reviewing your
            recruiter application. This typically takes 1-2 business days.
          </p>

          <div className="w-full rounded-lg bg-muted/50 p-4 text-left">
            <h3 className="text-sm font-medium text-foreground mb-2">What happens next?</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-yellow-500" />
                Our team reviews your company and recruiter details
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
                You&apos;ll receive an email notification with the decision
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
                Once approved, you&apos;ll get full access to the recruiting dashboard
              </li>
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ApprovedCard() {
  const router = useRouter();

  return (
    <Card className="border-green-200/50 dark:border-green-800/30">
      <CardContent className="p-8">
        <div className="flex flex-col items-center text-center">
          <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
            <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
          </div>

          <h2 className="text-xl font-semibold text-foreground mb-2">
            You&apos;re approved!
          </h2>
          <p className="text-muted-foreground mb-6 max-w-sm">
            Your recruiter account has been approved. You now have full access to
            the recruiting dashboard.
          </p>

          <Button
            size="lg"
            onClick={() => router.push("/dashboard")}
          >
            Go to Dashboard
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function RejectedCard() {
  return (
    <Card className="border-red-200/50 dark:border-red-800/30">
      <CardContent className="p-8">
        <div className="flex flex-col items-center text-center">
          <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
            <XCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
          </div>

          <h2 className="text-xl font-semibold text-foreground mb-2">
            Application not approved
          </h2>
          <p className="text-muted-foreground mb-6 max-w-sm">
            We were unable to approve your recruiter application at this time.
            Please contact support for more information.
          </p>

          <p className="text-sm text-muted-foreground">
            Questions? Contact us at{" "}
            <a
              href="mailto:support@think5.ai"
              className="text-primary hover:underline"
            >
              support@think5.ai
            </a>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
