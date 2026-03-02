"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Star,
  Wrench,
  Loader2,
} from "lucide-react";

interface Skill {
  id: string;
  name: string;
  category: string;
  proficiency: number;
  yearsOfExperience: number;
}

const categoryColors: Record<string, string> = {
  Technical: "bg-blue-400/10 text-blue-400 border-blue-400/20",
  Soft: "bg-green-400/10 text-green-400 border-green-400/20",
  Domain: "bg-purple-400/10 text-purple-400 border-purple-400/20",
  Other: "bg-amber-400/10 text-amber-400 border-amber-400/20",
};

export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Form state
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("Technical");
  const [newProficiency, setNewProficiency] = useState(3);
  const [newYears, setNewYears] = useState("");

  const fetchSkills = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/candidate/skills");
      if (res.ok) {
        const data = await res.json();
        setSkills(data.skills || []);
      }
    } catch {
      toast.error("Failed to load skills");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSkills();
  }, [fetchSkills]);

  const handleAddSkill = async () => {
    if (!newName.trim()) {
      toast.error("Please enter a skill name");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/candidate/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          category: newCategory,
          proficiency: newProficiency,
          yearsOfExperience: parseFloat(newYears) || 0,
        }),
      });
      if (res.ok) {
        toast.success("Skill added successfully");
        setDialogOpen(false);
        resetForm();
        fetchSkills();
      } else {
        toast.error("Failed to add skill");
      }
    } catch {
      toast.error("An error occurred");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSkill = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/candidate/skills?id=${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast.success("Skill removed");
        setSkills((prev) => prev.filter((s) => s.id !== id));
      } else {
        toast.error("Failed to delete skill");
      }
    } catch {
      toast.error("An error occurred");
    } finally {
      setDeletingId(null);
    }
  };

  const resetForm = () => {
    setNewName("");
    setNewCategory("Technical");
    setNewProficiency(3);
    setNewYears("");
  };

  return (
    <div>
      <div className="container mx-auto px-6">
        {/* Page Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Skills</h1>
            <p className="text-white/50">
              Manage your skills to improve job matching accuracy.
            </p>
          </div>
          <Button
            onClick={() => setDialogOpen(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Add Skill
          </Button>
        </div>

        {/* Skills Grid */}
        {loading ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-12 text-center">
            <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin mx-auto mb-4" />
            <p className="text-white/40">Loading skills...</p>
          </div>
        ) : skills.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-12 text-center">
            <Wrench className="w-12 h-12 text-white/20 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">No skills added yet</h3>
            <p className="text-white/40 text-sm mb-6">
              Add your skills to improve job matching.
            </p>
            <Button
              onClick={() => setDialogOpen(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Add Your First Skill
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {skills.map((skill) => (
              <Card
                key={skill.id}
                className="border-white/10 bg-white/5 shadow-none hover:bg-white/[0.07] transition-colors"
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-white text-base font-semibold">
                        {skill.name}
                      </CardTitle>
                      <Badge
                        className={cn(
                          "mt-2 text-xs",
                          categoryColors[skill.category] || categoryColors.Other
                        )}
                      >
                        {skill.category}
                      </Badge>
                    </div>
                    <button
                      onClick={() => handleDeleteSkill(skill.id)}
                      disabled={deletingId === skill.id}
                      className="text-white/30 hover:text-red-400 transition-colors disabled:opacity-50"
                    >
                      {deletingId === skill.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Proficiency */}
                  <div className="mb-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs text-white/40 uppercase tracking-wide">
                        Proficiency
                      </span>
                      <div className="flex items-center gap-0.5">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={star}
                            className={cn(
                              "w-3.5 h-3.5",
                              star <= skill.proficiency
                                ? "fill-blue-400 text-blue-400"
                                : "text-white/20"
                            )}
                          />
                        ))}
                      </div>
                    </div>
                    <Progress
                      value={skill.proficiency}
                      max={5}
                      className="h-1.5 bg-white/10"
                      indicatorClassName="bg-blue-500"
                    />
                  </div>

                  {/* Years */}
                  {skill.yearsOfExperience > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-white/40">Experience</span>
                      <span className="text-xs text-white/60">
                        {skill.yearsOfExperience} {skill.yearsOfExperience === 1 ? "year" : "years"}
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Add Skill Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="bg-background border-border">
            <DialogHeader>
              <DialogTitle>Add Skill</DialogTitle>
              <DialogDescription>
                Add a new skill to your profile.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <Label className="mb-2 block">Skill Name</Label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. React, Python, Project Management"
                />
              </div>
              <div>
                <Label className="mb-2 block">Category</Label>
                <Select value={newCategory} onValueChange={setNewCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Technical">Technical</SelectItem>
                    <SelectItem value="Soft">Soft</SelectItem>
                    <SelectItem value="Domain">Domain</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-2 block">
                  Proficiency ({newProficiency}/5)
                </Label>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setNewProficiency(star)}
                      className="focus:outline-none"
                    >
                      <Star
                        className={cn(
                          "w-6 h-6 transition-colors",
                          star <= newProficiency
                            ? "fill-blue-500 text-blue-500"
                            : "text-muted-foreground/30"
                        )}
                      />
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label className="mb-2 block">Years of Experience</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.5"
                  value={newYears}
                  onChange={(e) => setNewYears(e.target.value)}
                  placeholder="e.g. 3"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setDialogOpen(false);
                  resetForm();
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleAddSkill}
                disabled={saving}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                Add Skill
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
