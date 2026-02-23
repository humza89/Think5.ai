"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import {
  Plus,
  Clock,
  MessageSquare,
  Users,
  FileText,
  Loader2,
  Trash2,
} from "lucide-react";

export default function InterviewTemplatesPage() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/interview-templates")
      .then((r) => r.json())
      .then((data) => {
        setTemplates(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function handleDelete(id: string) {
    if (!confirm("Delete this template?")) return;
    try {
      const res = await fetch(`/api/interview-templates/${id}`, { method: "DELETE" });
      if (res.ok) {
        setTemplates((prev) => prev.filter((t) => t.id !== id));
      }
    } catch {}
  }

  return (
    <ProtectedRoute allowedRoles={["recruiter", "admin"]}>
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-[1200px] mx-auto px-6 py-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">Interview Templates</h1>
              <p className="text-sm text-gray-500 mt-1">
                Create reusable interview configurations for different roles
              </p>
            </div>
            <Link href="/interviews/templates/new">
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New Template
              </Button>
            </Link>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : templates.length === 0 ? (
            <Card className="p-12 text-center">
              <FileText className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No templates yet</h3>
              <p className="text-gray-500 mb-4">
                Create your first interview template to streamline your hiring process
              </p>
              <Link href="/interviews/templates/new">
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Template
                </Button>
              </Link>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates.map((template) => (
                <Card key={template.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-semibold text-gray-900">{template.name}</h3>
                        {template.roleType && (
                          <p className="text-sm text-gray-500">{template.roleType}</p>
                        )}
                      </div>
                      {template.isDefault && (
                        <Badge className="bg-blue-100 text-blue-700">Default</Badge>
                      )}
                    </div>

                    {template.description && (
                      <p className="text-sm text-gray-600 line-clamp-2 mb-4">
                        {template.description}
                      </p>
                    )}

                    <div className="flex items-center gap-4 text-xs text-gray-400 mb-4">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {template.durationMinutes} min
                      </span>
                      <span className="flex items-center gap-1">
                        <MessageSquare className="h-3 w-3" />
                        {(template.questions as any[])?.length || 0} questions
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {template._count?.interviews || 0} used
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <Link href={`/interviews/templates/${template.id}`} className="flex-1">
                        <Button variant="outline" size="sm" className="w-full">
                          Edit
                        </Button>
                      </Link>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(template.id)}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
