import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

export default function InterviewsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ProtectedRoute allowedRoles={["recruiter", "admin"]}>
      {children}
    </ProtectedRoute>
  );
}
