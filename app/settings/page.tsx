"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { useAuth } from "@/contexts/AuthContext";
import Link from "next/link";
import {
  User,
  Bell,
  Shield,
  Palette,
  FileText,
  Settings as SettingsIcon,
  Key,
} from "lucide-react";

export default function SettingsPage() {
  const { profile } = useAuth();

  const settingsSections = [
    {
      title: "Profile",
      description: "Manage your personal information",
      icon: User,
      href: "/candidate/profile",
      color: "text-blue-600 bg-blue-50",
    },
    {
      title: "Notifications",
      description: "Configure email and in-app notification preferences",
      icon: Bell,
      href: "#notifications",
      color: "text-purple-600 bg-purple-50",
    },
    {
      title: "Interview Templates",
      description: "Manage your reusable interview configurations",
      icon: FileText,
      href: "/interviews/templates",
      color: "text-green-600 bg-green-50",
      roles: ["recruiter", "admin"],
    },
    {
      title: "Security",
      description: "Password, two-factor authentication, and sessions",
      icon: Shield,
      href: "#security",
      color: "text-red-600 bg-red-50",
    },
    {
      title: "API Keys",
      description: "Manage API keys for external integrations",
      icon: Key,
      href: "#api-keys",
      color: "text-orange-600 bg-orange-50",
      roles: ["admin"],
    },
    {
      title: "Admin Panel",
      description: "Platform administration and user management",
      icon: SettingsIcon,
      href: "/admin",
      color: "text-gray-600 bg-gray-100",
      roles: ["admin"],
    },
  ];

  const filteredSections = settingsSections.filter(
    (s) => !s.roles || (profile && s.roles.includes(profile.role))
  );

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-3xl mx-auto px-6 py-8">
          <div className="mb-8">
            <h1 className="text-2xl font-semibold text-gray-900">Settings</h1>
            <p className="text-sm text-gray-500 mt-1">
              Manage your account and preferences
            </p>
          </div>

          <div className="space-y-3">
            {filteredSections.map((section) => {
              const Icon = section.icon;
              return (
                <Link key={section.title} href={section.href}>
                  <Card className="hover:shadow-md transition-shadow cursor-pointer">
                    <CardContent className="py-5">
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${section.color}`}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="flex-1">
                          <h3 className="font-medium text-gray-900">{section.title}</h3>
                          <p className="text-sm text-gray-500">{section.description}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
