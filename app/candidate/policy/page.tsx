"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ShieldCheck,
  Database,
  Eye,
  BarChart3,
  Clock,
  UserCheck,
} from "lucide-react";

interface RetentionPolicy {
  policy: {
    recordingDays: number;
    transcriptDays: number;
    candidateDataDays: number;
    source: string;
  };
}

export default function CandidatePolicyPage() {
  const [retention, setRetention] = useState<RetentionPolicy | null>(null);

  useEffect(() => {
    // Try to fetch retention policy (may fail if candidate doesn't have admin access)
    fetch("/api/admin/retention")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setRetention(data))
      .catch(() => setRetention(null));
  }, []);

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <ShieldCheck className="h-6 w-6 text-blue-600" />
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            Policies & Transparency
          </h1>
          <p className="text-sm text-muted-foreground">
            Understand how your interview data is collected, used, and protected
          </p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Data Collection & Usage */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Database className="h-4 w-4 text-blue-500" />
              Data Collection & Usage
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>During your interview, we collect the following data:</p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>
                <strong className="text-foreground">Interview transcript</strong> — A text
                record of the conversation between you and the AI interviewer.
              </li>
              <li>
                <strong className="text-foreground">Audio/video recording</strong> — If you
                enable your webcam or use voice mode, the session may be recorded.
              </li>
              <li>
                <strong className="text-foreground">Resume and profile data</strong> — Information
                you provide during onboarding, including skills, experience, and contact details.
              </li>
              <li>
                <strong className="text-foreground">Integrity telemetry</strong> — Browser events
                such as tab switches, paste events, and webcam status (see Integrity Monitoring
                below).
              </li>
            </ul>
            <p>
              Your data is used exclusively for interview evaluation and hiring purposes.
              It is shared only with the recruiting team that scheduled your interview.
            </p>
          </CardContent>
        </Card>

        {/* Integrity Monitoring */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Eye className="h-4 w-4 text-amber-500" />
              Integrity Monitoring
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              During the interview, the following activities are <strong className="text-foreground">monitored and logged</strong> as
              telemetry events:
            </p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>
                <strong className="text-foreground">Tab switches</strong> — When you navigate away
                from the interview tab, the event is recorded.
              </li>
              <li>
                <strong className="text-foreground">Paste events</strong> — If you paste text into
                the interview, this is detected and logged.
              </li>
              <li>
                <strong className="text-foreground">Webcam status</strong> — Whether your webcam
                is active or was disabled during the session.
              </li>
              <li>
                <strong className="text-foreground">Fullscreen exits</strong> — If you exit
                fullscreen mode, the event is recorded.
              </li>
            </ul>
            <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/30 rounded-lg p-3 mt-3">
              <p className="text-amber-800 dark:text-amber-300 text-xs">
                These events are logged as telemetry and contribute to your integrity score. They
                do not block your interview progress or prevent you from completing the session.
                The integrity score is one factor among many in the overall assessment.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Scoring Methodology */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-purple-500" />
              Scoring Methodology
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>Your interview is evaluated across multiple dimensions:</p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>
                <strong className="text-foreground">Domain expertise</strong> — Depth and breadth
                of knowledge in your field.
              </li>
              <li>
                <strong className="text-foreground">Problem solving</strong> — Analytical thinking,
                structured approach, and creativity.
              </li>
              <li>
                <strong className="text-foreground">Communication</strong> — Clarity, articulation,
                and ability to explain complex concepts.
              </li>
              <li>
                <strong className="text-foreground">Integrity</strong> — Computed from integrity
                monitoring events during the session.
              </li>
            </ul>
            <p>
              Each dimension produces a score from 0 to 100, which combines into an overall score.
              The AI generates a recommendation (Strong Yes, Yes, Maybe, No, Strong No) based on
              the overall assessment. A human reviewer can approve, flag, or override the AI
              recommendation.
            </p>
          </CardContent>
        </Card>

        {/* Data Retention */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-green-500" />
              Data Retention
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>Your data is retained according to the following schedule:</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2">
              <div className="p-3 rounded-lg border text-center">
                <p className="text-2xl font-bold text-foreground">
                  {retention?.policy.recordingDays ?? 90}
                </p>
                <p className="text-xs">days for recordings</p>
              </div>
              <div className="p-3 rounded-lg border text-center">
                <p className="text-2xl font-bold text-foreground">
                  {retention?.policy.transcriptDays ?? 365}
                </p>
                <p className="text-xs">days for transcripts</p>
              </div>
              <div className="p-3 rounded-lg border text-center">
                <p className="text-2xl font-bold text-foreground">
                  {retention?.policy.candidateDataDays ?? 730}
                </p>
                <p className="text-xs">days for personal data</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              After the retention period, recordings are permanently deleted, transcripts are
              removed, and personal data (email, phone, resume) is anonymized.
            </p>
          </CardContent>
        </Card>

        {/* Your Rights */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-indigo-500" />
              Your Rights
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <ul className="list-disc pl-5 space-y-1.5">
              <li>
                <strong className="text-foreground">Access</strong> — You can view your interview
                reports and scores from the Interviews section of your dashboard.
              </li>
              <li>
                <strong className="text-foreground">Data export</strong> — You can request an export
                of your data from your Settings page.
              </li>
              <li>
                <strong className="text-foreground">Deletion</strong> — You can request account
                deletion from your Settings page. This will permanently remove your personal data.
              </li>
              <li>
                <strong className="text-foreground">Consent withdrawal</strong> — You may withdraw
                consent at any time by contacting the recruiting team or using your account settings.
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
