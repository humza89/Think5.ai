"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Users } from "lucide-react";
import type { TeamInvitationEntry } from "@/types/recruiter-onboarding";

interface TeamConfigStepProps {
  data: TeamInvitationEntry[];
  onChange: (data: TeamInvitationEntry[]) => void;
}

const EMPTY_INVITATION: TeamInvitationEntry = {
  email: "",
  name: "",
  role: "recruiter",
  department: "",
};

export function TeamConfigStep({ data, onChange }: TeamConfigStepProps) {
  const addRow = () => {
    if (data.length >= 20) return;
    onChange([...data, { ...EMPTY_INVITATION }]);
  };

  const removeRow = (index: number) => {
    onChange(data.filter((_, i) => i !== index));
  };

  const updateRow = (index: number, field: keyof TeamInvitationEntry, value: string) => {
    const updated = [...data];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Team Configuration</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Invite team members to collaborate on hiring. You can skip this and invite later.
        </p>
      </div>

      {data.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-border rounded-lg">
          <Users className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground mb-4">No team members invited yet</p>
          <Button onClick={addRow} variant="outline">
            <Plus className="w-4 h-4 mr-2" />
            Add Team Member
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {data.map((inv, index) => (
            <div key={index} className="p-4 border border-border rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="text-xs">
                  Invite #{index + 1}
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeRow(index)}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Email *</Label>
                  <Input
                    placeholder="colleague@company.com"
                    value={inv.email}
                    onChange={(e) => updateRow(index, "email", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Name</Label>
                  <Input
                    placeholder="Jane Doe"
                    value={inv.name}
                    onChange={(e) => updateRow(index, "name", e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Role</Label>
                  <Select
                    value={inv.role}
                    onValueChange={(v) => updateRow(index, "role", v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="recruiter">Recruiter</SelectItem>
                      <SelectItem value="hiring_manager">Hiring Manager</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Department</Label>
                  <Input
                    placeholder="Engineering"
                    value={inv.department}
                    onChange={(e) => updateRow(index, "department", e.target.value)}
                  />
                </div>
              </div>
            </div>
          ))}

          {data.length < 20 && (
            <Button onClick={addRow} variant="outline" className="w-full">
              <Plus className="w-4 h-4 mr-2" />
              Add Another ({data.length}/20)
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
