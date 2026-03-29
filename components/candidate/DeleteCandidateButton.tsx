"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { deleteCandidate } from "@/app/(dashboard)/candidates/actions";
import { Button } from "@/components/ui/button";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogClose,
} from "@/components/ui/responsive-dialog";

export default function DeleteCandidateButton({ candidateId, candidateName }: { candidateId: string; candidateName: string }) {
  const [open, setOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    const promise = deleteCandidate(candidateId);
    toast.promise(promise, {
      loading: "Deleting candidate...",
      success: `${candidateName} has been deleted`,
      error: "Failed to delete candidate. Please try again.",
    });
    try {
      await promise;
      setOpen(false);
    } catch {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="text-red-600 border-red-300 hover:bg-red-50"
      >
        <Trash2 className="h-4 w-4 mr-1" />
        Delete
      </Button>

      <ResponsiveDialog open={open} onOpenChange={setOpen}>
        <ResponsiveDialogContent>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>Delete Candidate</ResponsiveDialogTitle>
            <ResponsiveDialogDescription>
              Are you sure you want to delete <strong>{candidateName}</strong>? This action cannot be undone.
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <ResponsiveDialogFooter>
            <ResponsiveDialogClose asChild>
              <Button variant="outline" disabled={isDeleting}>
                Cancel
              </Button>
            </ResponsiveDialogClose>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>
          </ResponsiveDialogFooter>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </>
  );
}
