"use client";

import { useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, Search, Plus, Loader2 } from "lucide-react";
import type { CompanySetupData } from "@/types/recruiter-onboarding";

interface CompanySetupStepProps {
  data: CompanySetupData;
  onChange: (data: CompanySetupData) => void;
}

interface CompanyResult {
  id: string;
  name: string;
  industry: string | null;
  logoUrl: string | null;
  companyLogoCdnUrl: string | null;
}

export function CompanySetupStep({ data, onChange }: CompanySetupStepProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<CompanyResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [activeTab, setActiveTab] = useState<string>(data.mode === "join" ? "join" : "create");

  const updateField = (field: keyof CompanySetupData, value: unknown) => {
    onChange({ ...data, mode: activeTab as "create" | "join", [field]: value });
  };

  const searchCompanies = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(`/api/clients?search=${encodeURIComponent(searchQuery)}`);
      if (res.ok) {
        const result = await res.json();
        setSearchResults(Array.isArray(result) ? result : result.clients || []);
      }
    } catch {
      // ignore search errors
    }
    setSearching(false);
  }, [searchQuery]);

  const selectCompany = (company: CompanyResult) => {
    onChange({ ...data, mode: "join", companyId: company.id, name: company.name });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Company Setup</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Create your company profile or join an existing one.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); onChange({ ...data, mode: v as "create" | "join" }); }}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="create">
            <Plus className="w-4 h-4 mr-2" />
            Create Company
          </TabsTrigger>
          <TabsTrigger value="join">
            <Search className="w-4 h-4 mr-2" />
            Join Existing
          </TabsTrigger>
        </TabsList>

        <TabsContent value="create" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="companyName">Company Name *</Label>
              <Input
                id="companyName"
                placeholder="Acme Corp"
                value={data.name || ""}
                onChange={(e) => updateField("name", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="industry">Industry</Label>
              <Input
                id="industry"
                placeholder="Technology"
                value={data.industry || ""}
                onChange={(e) => updateField("industry", e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="companySize">Company Size</Label>
              <Input
                id="companySize"
                placeholder="50-200"
                value={data.companySize || ""}
                onChange={(e) => updateField("companySize", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="website">Website</Label>
              <Input
                id="website"
                placeholder="https://acme.com"
                value={data.website || ""}
                onChange={(e) => updateField("website", e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="headquarters">Headquarters</Label>
              <Input
                id="headquarters"
                placeholder="San Francisco, CA"
                value={data.headquarters || ""}
                onChange={(e) => updateField("headquarters", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="domain">Email Domain</Label>
              <Input
                id="domain"
                placeholder="acme.com"
                value={data.domain || ""}
                onChange={(e) => updateField("domain", e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Team members with this email domain can auto-join</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Brief description of your company..."
              value={data.description || ""}
              onChange={(e) => updateField("description", e.target.value)}
              rows={3}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="logoUrl">Logo URL</Label>
              <Input
                id="logoUrl"
                placeholder="https://..."
                value={data.logoUrl || ""}
                onChange={(e) => updateField("logoUrl", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="brandColor">Brand Color</Label>
              <div className="flex gap-2">
                <Input
                  id="brandColor"
                  placeholder="#3B82F6"
                  value={data.brandColor || ""}
                  onChange={(e) => updateField("brandColor", e.target.value)}
                />
                {data.brandColor && (
                  <div
                    className="w-10 h-10 rounded-md border border-border flex-shrink-0"
                    style={{ backgroundColor: data.brandColor }}
                  />
                )}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tagline">Tagline</Label>
            <Input
              id="tagline"
              placeholder="Building the future of work"
              value={data.tagline || ""}
              onChange={(e) => updateField("tagline", e.target.value)}
            />
          </div>
        </TabsContent>

        <TabsContent value="join" className="space-y-4 mt-4">
          <div className="flex gap-2">
            <Input
              placeholder="Search companies by name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && searchCompanies()}
            />
            <Button onClick={searchCompanies} disabled={searching}>
              {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            </Button>
          </div>

          {searchResults.length > 0 && (
            <div className="space-y-2">
              {searchResults.map((company) => (
                <Card
                  key={company.id}
                  className={`p-4 cursor-pointer transition-colors hover:bg-accent ${
                    data.companyId === company.id ? "ring-2 ring-primary" : ""
                  }`}
                  onClick={() => selectCompany(company)}
                >
                  <div className="flex items-center gap-3">
                    {company.companyLogoCdnUrl || company.logoUrl ? (
                      <img
                        src={company.companyLogoCdnUrl || company.logoUrl || ""}
                        alt={company.name}
                        className="w-10 h-10 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                        <Building2 className="w-5 h-5 text-muted-foreground" />
                      </div>
                    )}
                    <div>
                      <p className="font-medium text-foreground">{company.name}</p>
                      {company.industry && (
                        <p className="text-sm text-muted-foreground">{company.industry}</p>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {searchResults.length === 0 && searchQuery && !searching && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No companies found. Try a different search or create a new company.
            </p>
          )}

          {data.mode === "join" && data.companyId && (
            <div className="p-3 bg-primary/10 border border-primary/20 rounded-lg">
              <p className="text-sm font-medium text-primary">
                Selected: {data.name}
              </p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
