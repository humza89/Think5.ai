"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Building2, Globe, MapPin, Users, Calendar, ArrowLeft, Plus, Briefcase, LayoutDashboard, UserCircle, Send, MessageSquare, ChevronRight } from "lucide-react";

interface Client {
  id: string;
  name: string;
  industry?: string;
  funding?: string;
  companySize?: string;
  logoUrl?: string;
  companyLogoCdnUrl?: string;
  website?: string;
  description?: string;
  linkedinUrl?: string;
  employeeCount?: number;
  foundedYear?: number;
  headquarters?: string;
  roles: Role[];
  createdAt: string;
  updatedAt: string;
}

interface Role {
  id: string;
  title: string;
  location?: string;
  salaryRange?: string;
  skillsRequired: string[];
  description?: string;
}

export default function ClientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [client, setClient] = useState<Client | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "roles">("overview");

  useEffect(() => {
    if (params.id) {
      fetchClient(params.id as string);
    }
  }, [params.id]);

  async function fetchClient(id: string) {
    try {
      const response = await fetch(`/api/clients/${id}`);
      if (response.ok) {
        const data = await response.json();
        setClient(data);
      }
    } catch (error) {
      console.error("Error fetching client:", error);
    } finally {
      setIsLoading(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <p className="text-gray-500 mb-4">Client not found</p>
          <Button onClick={() => router.push("/clients")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Clients
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex">
      {/* Sidebar */}
      <aside className="w-48 bg-white border-r border-gray-200 flex flex-col">
        {/* Company Logo & Name */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0">
              {(client.companyLogoCdnUrl || client.logoUrl) ? (
                <img
                  src={client.companyLogoCdnUrl || client.logoUrl}
                  alt={client.name}
                  className="w-full h-full object-contain"
                />
              ) : (
                <Building2 className="w-5 h-5 text-gray-600" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <span className="font-semibold text-sm truncate block">{client.name}</span>
              <span className="text-xs text-gray-500">Senior/Staff Product Engineer</span>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4">
          <button
            onClick={() => setActiveTab("overview")}
            className={`w-full flex items-center gap-3 px-4 py-2 text-sm rounded-lg mx-2 mb-1 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
              activeTab === "overview"
                ? "font-medium text-gray-900 bg-gray-100"
                : "text-gray-700 hover:bg-gray-50"
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            <span>Overview</span>
          </button>

          <Link
            href="/candidates"
            className="flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-lg mx-2 mb-1 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Users className="w-4 h-4" />
            <span>Sourcing</span>
          </Link>

          <button className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-lg mx-2 mb-1 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
            <UserCircle className="w-4 h-4" />
            <span>Past candidates</span>
          </button>

          <button className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-lg mx-2 mb-1 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
            <ChevronRight className="w-4 h-4" />
            <span>Pipeline</span>
          </button>

          <div className="border-t border-gray-200 my-2"></div>

          <button className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-lg mx-2 mb-1 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
            <Send className="w-4 h-4" />
            <span>Submit</span>
          </button>

          <button className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-lg mx-2 mb-1 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
            <MessageSquare className="w-4 h-4" />
            <span>Messages</span>
          </button>

          <button className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-lg mx-2 mb-1 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
            <UserCircle className="w-4 h-4" />
            <span>My candidates</span>
          </button>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto px-8 py-8">
        {/* Back Button */}
        <Button
          variant="ghost"
          onClick={() => router.push("/clients")}
          className="mb-6"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Clients
        </Button>

        {/* Company Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-4">
              <div className="w-20 h-20 bg-blue-100 rounded-lg flex items-center justify-center">
                {(client.companyLogoCdnUrl || client.logoUrl) ? (
                  <img
                    src={client.companyLogoCdnUrl || client.logoUrl}
                    alt={client.name}
                    className="w-full h-full object-cover rounded-lg"
                  />
                ) : (
                  <Building2 className="h-10 w-10 text-blue-600" />
                )}
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">{client.name}</h1>
                <div className="flex gap-2 mt-2">
                  {client.industry && (
                    <Badge variant="secondary">{client.industry}</Badge>
                  )}
                  {client.funding && (
                    <Badge variant="outline">{client.funding}</Badge>
                  )}
                  {client.companySize && (
                    <Badge variant="outline">{client.companySize}</Badge>
                  )}
                </div>
              </div>
            </div>
            <Button onClick={() => router.push(`/clients/${client.id}/roles/new`)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Role
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-lg shadow-sm mb-6">
          <div className="border-b">
            <nav className="flex space-x-8 px-6">
              <button
                onClick={() => setActiveTab("overview")}
                className={`py-4 px-1 border-b-2 font-medium text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                  activeTab === "overview"
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                Overview
              </button>
              <button
                onClick={() => setActiveTab("roles")}
                className={`py-4 px-1 border-b-2 font-medium text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                  activeTab === "roles"
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                Roles ({client.roles.length})
              </button>
            </nav>
          </div>

          <div className="p-6">
            {activeTab === "overview" && (
              <div className="space-y-6">
                {/* Company Information */}
                <Card>
                  <CardHeader>
                    <CardTitle>Company Information</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {client.description && (
                      <div>
                        <h3 className="text-sm font-medium text-gray-500 mb-2">Description</h3>
                        <p className="text-gray-900">{client.description}</p>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {client.website && (
                        <div className="flex items-start gap-2">
                          <Globe className="h-5 w-5 text-gray-400 mt-0.5" />
                          <div>
                            <p className="text-sm font-medium text-gray-500">Website</p>
                            <a
                              href={client.website}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline"
                            >
                              {client.website}
                            </a>
                          </div>
                        </div>
                      )}

                      {client.linkedinUrl && (
                        <div className="flex items-start gap-2">
                          <Building2 className="h-5 w-5 text-gray-400 mt-0.5" />
                          <div>
                            <p className="text-sm font-medium text-gray-500">LinkedIn</p>
                            <a
                              href={client.linkedinUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline"
                            >
                              View Profile
                            </a>
                          </div>
                        </div>
                      )}

                      {client.headquarters && (
                        <div className="flex items-start gap-2">
                          <MapPin className="h-5 w-5 text-gray-400 mt-0.5" />
                          <div>
                            <p className="text-sm font-medium text-gray-500">Headquarters</p>
                            <p className="text-gray-900">{client.headquarters}</p>
                          </div>
                        </div>
                      )}

                      {client.employeeCount && (
                        <div className="flex items-start gap-2">
                          <Users className="h-5 w-5 text-gray-400 mt-0.5" />
                          <div>
                            <p className="text-sm font-medium text-gray-500">Employee Count</p>
                            <p className="text-gray-900">{client.employeeCount.toLocaleString()}</p>
                          </div>
                        </div>
                      )}

                      {client.foundedYear && (
                        <div className="flex items-start gap-2">
                          <Calendar className="h-5 w-5 text-gray-400 mt-0.5" />
                          <div>
                            <p className="text-sm font-medium text-gray-500">Founded</p>
                            <p className="text-gray-900">{client.foundedYear}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Quick Stats */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-center">
                        <p className="text-3xl font-bold text-blue-600">{client.roles.length}</p>
                        <p className="text-sm text-gray-500 mt-1">Active Roles</p>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-center">
                        <p className="text-3xl font-bold text-green-600">0</p>
                        <p className="text-sm text-gray-500 mt-1">Placements</p>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-center">
                        <p className="text-3xl font-bold text-purple-600">0</p>
                        <p className="text-sm text-gray-500 mt-1">In Pipeline</p>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}

            {activeTab === "roles" && (
              <div className="space-y-4">
                {client.roles.length > 0 ? (
                  client.roles.map((role) => (
                    <Card key={role.id}>
                      <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <Briefcase className="h-5 w-5 text-gray-500" />
                              <h3 className="font-semibold text-lg">{role.title}</h3>
                            </div>
                            <div className="flex gap-4 mt-2 text-sm text-gray-600">
                              {role.location && <span>{role.location}</span>}
                              {role.salaryRange && <span>{role.salaryRange}</span>}
                            </div>
                            {role.skillsRequired.length > 0 && (
                              <div className="flex flex-wrap gap-2 mt-3">
                                {role.skillsRequired.slice(0, 5).map((skill, idx) => (
                                  <Badge key={idx} variant="outline">
                                    {skill}
                                  </Badge>
                                ))}
                                {role.skillsRequired.length > 5 && (
                                  <Badge variant="outline">
                                    +{role.skillsRequired.length - 5} more
                                  </Badge>
                                )}
                              </div>
                            )}
                          </div>
                          <Button variant="outline">View Matches</Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                ) : (
                  <div className="text-center py-12">
                    <Briefcase className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                    <p className="text-gray-500 mb-4">No roles yet</p>
                    <Button onClick={() => router.push(`/clients/${client.id}/roles/new`)}>
                      <Plus className="mr-2 h-4 w-4" />
                      Add Your First Role
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        </div>
      </main>
    </div>
  );
}
