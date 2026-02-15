"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Building2, Plus, Briefcase, Users } from "lucide-react";

interface Client {
  id: string;
  name: string;
  industry?: string;
  funding?: string;
  companySize?: string;
  logoUrl?: string;
  companyLogoCdnUrl?: string;
  linkedinUrl?: string;
  employeeCount?: number;
  foundedYear?: number;
  headquarters?: string;
  roles: Role[];
}

interface Role {
  id: string;
  title: string;
  location?: string;
  salaryRange?: string;
  skillsRequired: string[];
}

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [isClientDialogOpen, setIsClientDialogOpen] = useState(false);
  const [isRoleDialogOpen, setIsRoleDialogOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [inputMethod, setInputMethod] = useState<"linkedin" | "manual">("linkedin");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [isImporting, setIsImporting] = useState(false);

  // Client form state
  const [clientForm, setClientForm] = useState({
    name: "",
    industry: "",
    funding: "",
    companySize: "",
    logoUrl: "",
    website: "",
    description: "",
  });

  // Role form state
  const [roleForm, setRoleForm] = useState({
    title: "",
    location: "",
    salaryRange: "",
    skillsRequired: "",
    description: "",
    experienceYears: "",
  });

  useEffect(() => {
    fetchClients();
  }, []);

  async function fetchClients() {
    try {
      const response = await fetch("/api/clients");
      if (response.ok) {
        const data = await response.json();
        setClients(data);
      }
    } catch (error) {
      console.error("Error fetching clients:", error);
    }
  }

  const [linkedinCompanyData, setLinkedinCompanyData] = useState<any>(null);

  async function handleLinkedInImport() {
    if (!linkedinUrl.trim()) {
      alert("Please enter a LinkedIn company URL");
      return;
    }

    setIsImporting(true);
    try {
      const response = await fetch("/api/clients/import-linkedin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkedinUrl }),
      });

      if (response.ok) {
        const companyData = await response.json();
        // Store the full LinkedIn data
        setLinkedinCompanyData(companyData);

        // Pre-fill the form with LinkedIn data
        setClientForm({
          name: companyData.name || "",
          industry: companyData.industry || "",
          funding: clientForm.funding, // Keep existing
          companySize: companyData.companySize || "",
          logoUrl: companyData.companyLogoCdnUrl || "",
          website: companyData.website || "",
          description: companyData.description || "",
        });
        setInputMethod("manual"); // Switch to manual so user can review/edit
      } else {
        const error = await response.json();
        alert(`Failed to import from LinkedIn: ${error.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Error importing from LinkedIn:", error);
      alert("Failed to import from LinkedIn");
    } finally {
      setIsImporting(false);
    }
  }

  async function handleCreateClient() {
    if (!clientForm.name) {
      alert("Company name is required");
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...clientForm,
          linkedinUrl: linkedinUrl || undefined,
          // Include LinkedIn-specific data if available
          linkedinId: linkedinCompanyData?.linkedinId,
          companyLogoCdnUrl: linkedinCompanyData?.companyLogoCdnUrl,
          employeeCount: linkedinCompanyData?.employeeCount,
          foundedYear: linkedinCompanyData?.foundedYear,
          headquarters: linkedinCompanyData?.headquarters,
          specialties: linkedinCompanyData?.specialties,
        }),
      });

      if (response.ok) {
        await fetchClients();
        setIsClientDialogOpen(false);
        setClientForm({
          name: "",
          industry: "",
          funding: "",
          companySize: "",
          logoUrl: "",
          website: "",
          description: "",
        });
        setLinkedinUrl("");
        setLinkedinCompanyData(null);
        setInputMethod("linkedin");
      }
    } catch (error) {
      console.error("Error creating client:", error);
      alert("Failed to create client");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCreateRole() {
    if (!roleForm.title || !roleForm.description || !selectedClient) {
      alert("Title and description are required");
      return;
    }

    setIsLoading(true);
    try {
      const skillsArray = roleForm.skillsRequired
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s);

      const response = await fetch("/api/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...roleForm,
          skillsRequired: skillsArray,
          clientId: selectedClient.id,
        }),
      });

      if (response.ok) {
        await fetchClients();
        setIsRoleDialogOpen(false);
        setRoleForm({
          title: "",
          location: "",
          salaryRange: "",
          skillsRequired: "",
          description: "",
          experienceYears: "",
        });
      }
    } catch (error) {
      console.error("Error creating role:", error);
      alert("Failed to create role");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2">
              <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center">
                <Building2 className="w-5 h-5 text-white" />
              </div>
              <span className="font-semibold text-lg">Runway</span>
            </Link>

            {/* Navigation */}
            <nav className="flex items-center gap-6">
              <Link
                href="/candidates"
                className="flex items-center gap-2 text-sm text-gray-700 hover:text-gray-900"
              >
                <Users className="w-4 h-4" />
                <span>Candidates</span>
              </Link>
              <Link
                href="/clients"
                className="flex items-center gap-2 text-sm font-medium text-gray-900"
              >
                <Building2 className="w-4 h-4" />
                <span>Clients</span>
              </Link>
            </nav>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-8 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold">Clients & Roles</h1>
          <Dialog open={isClientDialogOpen} onOpenChange={setIsClientDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Building2 className="mr-2 h-4 w-4" />
                Add Client
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Add New Client</DialogTitle>
              </DialogHeader>

              {/* Tab Buttons */}
              <div className="flex gap-2 border-b pb-2">
                <Button
                  variant={inputMethod === "linkedin" ? "default" : "outline"}
                  onClick={() => setInputMethod("linkedin")}
                  size="sm"
                >
                  LinkedIn URL
                </Button>
                <Button
                  variant={inputMethod === "manual" ? "default" : "outline"}
                  onClick={() => setInputMethod("manual")}
                  size="sm"
                >
                  Manual Entry
                </Button>
              </div>

              {inputMethod === "linkedin" ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      LinkedIn Company URL
                    </label>
                    <Input
                      value={linkedinUrl}
                      onChange={(e) => setLinkedinUrl(e.target.value)}
                      placeholder="https://www.linkedin.com/company/example"
                    />
                  </div>
                  <Button
                    onClick={handleLinkedInImport}
                    disabled={isImporting}
                    className="w-full"
                  >
                    {isImporting ? "Importing..." : "Import from LinkedIn"}
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Company Name *
                    </label>
                    <Input
                      value={clientForm.name}
                      onChange={(e) =>
                        setClientForm({ ...clientForm, name: e.target.value })
                      }
                      placeholder="Acme Corp"
                    />
                  </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Industry
                    </label>
                    <Input
                      value={clientForm.industry}
                      onChange={(e) =>
                        setClientForm({ ...clientForm, industry: e.target.value })
                      }
                      placeholder="Technology, Finance, etc."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Company Size
                    </label>
                    <Input
                      value={clientForm.companySize}
                      onChange={(e) =>
                        setClientForm({ ...clientForm, companySize: e.target.value })
                      }
                      placeholder="1-50, 50-200, 200+, etc."
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Funding Stage
                  </label>
                  <Input
                    value={clientForm.funding}
                    onChange={(e) =>
                      setClientForm({ ...clientForm, funding: e.target.value })
                    }
                    placeholder="Seed, Series A, B, C, etc."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Website</label>
                  <Input
                    value={clientForm.website}
                    onChange={(e) =>
                      setClientForm({ ...clientForm, website: e.target.value })
                    }
                    placeholder="https://example.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Logo URL
                  </label>
                  <Input
                    value={clientForm.logoUrl}
                    onChange={(e) =>
                      setClientForm({ ...clientForm, logoUrl: e.target.value })
                    }
                    placeholder="https://example.com/logo.png"
                  />
                </div>
                <div className="flex justify-end space-x-2 mt-4">
                  <Button
                    variant="outline"
                    onClick={() => setIsClientDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button onClick={handleCreateClient} disabled={isLoading}>
                    {isLoading ? "Creating..." : "Create Client"}
                  </Button>
                </div>
              </div>
              )}
            </DialogContent>
          </Dialog>
        </div>

        {/* Clients List */}
        <div className="space-y-6">
          {clients.length > 0 ? (
            clients.map((client) => (
              <Card key={client.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <Link href={`/clients/${client.id}`} className="flex items-center space-x-4 flex-1 cursor-pointer">
                      <div className="w-16 h-16 bg-blue-100 rounded-lg flex items-center justify-center">
                        {(client.companyLogoCdnUrl || client.logoUrl) ? (
                          <img
                            src={client.companyLogoCdnUrl || client.logoUrl}
                            alt={client.name}
                            className="w-full h-full object-cover rounded-lg"
                          />
                        ) : (
                          <Building2 className="h-8 w-8 text-blue-600" />
                        )}
                      </div>
                      <div>
                        <CardTitle className="text-xl hover:text-blue-600 transition-colors">{client.name}</CardTitle>
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
                    </Link>
                    <Button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedClient(client);
                        setIsRoleDialogOpen(true);
                      }}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Add Role
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {client.roles.length > 0 ? (
                    <div className="space-y-3">
                      <h4 className="font-semibold text-sm text-gray-700">
                        Open Roles ({client.roles.length})
                      </h4>
                      {client.roles.map((role) => (
                        <div
                          key={role.id}
                          className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <Briefcase className="h-4 w-4 text-gray-500" />
                              <h5 className="font-medium">{role.title}</h5>
                            </div>
                            <div className="flex gap-4 mt-2 text-sm text-gray-600">
                              {role.location && <span>{role.location}</span>}
                              {role.salaryRange && <span>{role.salaryRange}</span>}
                            </div>
                            <div className="flex flex-wrap gap-2 mt-2">
                              {role.skillsRequired.slice(0, 5).map((skill, idx) => (
                                <Badge key={idx} variant="outline">
                                  {skill}
                                </Badge>
                              ))}
                            </div>
                          </div>
                          <Button variant="outline" size="sm">
                            View Matches
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-center py-8 text-gray-500">
                      No roles yet. Add a role to start matching candidates.
                    </p>
                  )}
                </CardContent>
              </Card>
            ))
          ) : (
            <Card>
              <CardContent className="p-12 text-center">
                <Building2 className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                <p className="text-gray-500 mb-4">No clients yet</p>
                <Button onClick={() => setIsClientDialogOpen(true)}>
                  <Building2 className="mr-2 h-4 w-4" />
                  Add Your First Client
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Add Role Dialog */}
        <Dialog open={isRoleDialogOpen} onOpenChange={setIsRoleDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                Add Role for {selectedClient?.name}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Job Title *
                </label>
                <Input
                  value={roleForm.title}
                  onChange={(e) =>
                    setRoleForm({ ...roleForm, title: e.target.value })
                  }
                  placeholder="Senior Software Engineer"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Location
                  </label>
                  <Input
                    value={roleForm.location}
                    onChange={(e) =>
                      setRoleForm({ ...roleForm, location: e.target.value })
                    }
                    placeholder="San Francisco, Remote, etc."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Salary Range
                  </label>
                  <Input
                    value={roleForm.salaryRange}
                    onChange={(e) =>
                      setRoleForm({ ...roleForm, salaryRange: e.target.value })
                    }
                    placeholder="$120k - $180k"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">
                  Experience Years
                </label>
                <Input
                  value={roleForm.experienceYears}
                  onChange={(e) =>
                    setRoleForm({ ...roleForm, experienceYears: e.target.value })
                  }
                  placeholder="5+ years"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">
                  Required Skills (comma-separated)
                </label>
                <Input
                  value={roleForm.skillsRequired}
                  onChange={(e) =>
                    setRoleForm({ ...roleForm, skillsRequired: e.target.value })
                  }
                  placeholder="React, TypeScript, Node.js, AWS"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">
                  Job Description *
                </label>
                <textarea
                  value={roleForm.description}
                  onChange={(e) =>
                    setRoleForm({ ...roleForm, description: e.target.value })
                  }
                  placeholder="Describe the role, responsibilities, and requirements..."
                  className="w-full min-h-[120px] px-3 py-2 border rounded-md"
                />
              </div>
            </div>
            <div className="flex justify-end space-x-2 mt-4">
              <Button
                variant="outline"
                onClick={() => setIsRoleDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button onClick={handleCreateRole} disabled={isLoading}>
                {isLoading ? "Creating..." : "Create Role"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
