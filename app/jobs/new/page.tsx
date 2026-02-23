"use client";

import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { JobCreationWizard } from "@/components/jobs/JobCreationWizard";

export default function NewJobPage() {
  return (
    <ProtectedRoute allowedRoles={["recruiter", "admin"]}>
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-[1400px] mx-auto px-6 py-8">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold text-gray-900">Create New Job</h1>
            <p className="text-sm text-gray-500 mt-1">
              Fill in the details below to create a new job posting
            </p>
          </div>
          <JobCreationWizard />
        </div>
      </div>
    </ProtectedRoute>
  );
}
