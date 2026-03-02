"use client";

import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { CandidateLayout } from "@/components/layout/CandidateLayout";

export default function CandidateGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ProtectedRoute allowedRoles={["candidate"]}>
      <CandidateLayout>{children}</CandidateLayout>
    </ProtectedRoute>
  );
}
