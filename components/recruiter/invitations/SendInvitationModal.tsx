"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Mail, CheckCircle2 } from "lucide-react";

interface SendInvitationModalProps {
  mode: "candidate" | "passive";
  targetId: string;
  defaultEmail?: string;
  defaultName?: string;
  jobs: { id: string; title: string; companyName: string }[];
}

export function SendInvitationModal({ mode, targetId, defaultEmail, defaultName, jobs }: SendInvitationModalProps) {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [jobId, setJobId] = useState("");
  const [email, setEmail] = useState(defaultEmail || "");
  const [sent, setSent] = useState(false);

  const handleSend = async () => {
    if (!jobId || !email) {
      toast.error("Please select a job and provide an email.");
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch("/api/v1/interviews/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          email,
          ...(mode === "candidate" ? { candidateId: targetId } : { passiveProfileId: targetId })
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send invitation");

      toast.success("Invitation sent successfully!");
      setSent(true);
      setTimeout(() => setOpen(false), 2000); // close after showing success state
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="default" className="gap-2">
          <Mail className="h-4 w-4" /> Send Invite
        </Button>
      </DialogTrigger>
      
      <DialogContent className="sm:max-w-[425px]">
        {sent ? (
          <div className="flex flex-col items-center justify-center py-10">
            <CheckCircle2 className="h-16 w-16 text-green-500 mb-4" />
            <h2 className="text-xl font-semibold">Invitation Sent!</h2>
            <p className="text-muted-foreground mt-2 text-center">
              An email has been dispatched to {email}.
            </p>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Invite to AI Interview</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium">Candidate Email</label>
                <Input 
                  type="email" 
                  value={email} 
                  onChange={(e) => setEmail(e.target.value)} 
                  placeholder="name@example.com" 
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Select Job Pipeline</label>
                <Select value={jobId} onValueChange={setJobId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a job..." />
                  </SelectTrigger>
                  <SelectContent>
                    {jobs.map((j) => (
                      <SelectItem key={j.id} value={j.id}>
                        {j.title} ({j.companyName})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Message Details (Optional)</label>
                <Textarea 
                  placeholder="Add a custom note to the email..." 
                  className="resize-none"
                  rows={3}
                  disabled
                />
                <p className="text-xs text-muted-foreground text-right">*Custom messages coming soon in v2</p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={handleSend} disabled={isLoading || !jobId || !email}>
                {isLoading ? "Sending..." : "Send Invitation"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
