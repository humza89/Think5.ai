"use client";

import { useState, useCallback, useRef } from "react";
import {
  Upload,
  FileText,
  CheckCircle2,
  Loader2,
  X,
  RefreshCw,
  Bot,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type {
  ResumeUploadData,
  AIProfileReviewData,
} from "@/lib/validations/onboarding";

// ============================================
// Types
// ============================================

interface ResumeData extends ResumeUploadData {
  parsedData?: AIProfileReviewData;
}

interface ResumeUploadStepProps {
  data: ResumeData;
  onUploadComplete: (data: ResumeData) => void;
}

type UploadStatus = "idle" | "uploading" | "parsing" | "done" | "error";

// ============================================
// Helpers
// ============================================

const ACCEPTED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
const ACCEPTED_EXTENSIONS = ".pdf,.docx";
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ============================================
// Component
// ============================================

export function ResumeUploadStep({
  data,
  onUploadComplete,
}: ResumeUploadStepProps) {
  const [status, setStatus] = useState<UploadStatus>(
    data.fileUrl ? "done" : "idle"
  );
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // ------------------------------------------
  // Validation
  // ------------------------------------------
  const validateFile = useCallback((file: File): string | null => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      return "Only PDF and DOCX files are accepted.";
    }
    if (file.size > MAX_FILE_SIZE) {
      return `File size must be under 10 MB. Yours is ${formatFileSize(file.size)}.`;
    }
    return null;
  }, []);

  // ------------------------------------------
  // Upload handler
  // ------------------------------------------
  const uploadFile = useCallback(
    async (file: File) => {
      const error = validateFile(file);
      if (error) {
        toast.error(error);
        return;
      }

      setStatus("uploading");

      try {
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch("/api/candidate/onboarding/resume-upload", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.message ?? `Upload failed (${res.status})`);
        }

        const result = await res.json();

        // The API returns the file URL immediately; parsing may follow
        const resumeData: ResumeData = {
          fileUrl: result.fileUrl,
          filename: file.name,
          mimeType: file.type,
          fileSize: file.size,
        };

        onUploadComplete(resumeData);
        setStatus("parsing");

        // If the API returned parsed data inline, apply it now
        if (result.parsedData) {
          onUploadComplete({
            ...resumeData,
            parsedData: result.parsedData as AIProfileReviewData,
          });
          setStatus("done");
          toast.success("Resume uploaded and parsed successfully");
        } else if (result.parseJobId) {
          // Poll for parsing result
          await pollParsing(result.parseJobId, resumeData);
        } else {
          // No parse — just mark done
          setStatus("done");
          toast.success("Resume uploaded successfully");
        }
      } catch (err) {
        setStatus("error");
        toast.error(
          err instanceof Error ? err.message : "Upload failed"
        );
      }
    },
    [validateFile, onUploadComplete]
  );

  // ------------------------------------------
  // Poll for parsing result
  // ------------------------------------------
  const pollParsing = useCallback(
    async (jobId: string, resumeData: ResumeData) => {
      const MAX_ATTEMPTS = 30;
      const INTERVAL = 2000;

      for (let i = 0; i < MAX_ATTEMPTS; i++) {
        await new Promise((r) => setTimeout(r, INTERVAL));

        try {
          const res = await fetch(
            `/api/candidate/onboarding/resume-upload?jobId=${jobId}`
          );
          if (!res.ok) continue;

          const result = await res.json();
          if (result.status === "completed" && result.parsedData) {
            onUploadComplete({
              ...resumeData,
              parsedData: result.parsedData as AIProfileReviewData,
            });
            setStatus("done");
            toast.success("Resume parsed successfully");
            return;
          }
          if (result.status === "failed") {
            setStatus("done");
            toast.warning(
              "Resume uploaded but parsing failed. You can fill in details manually."
            );
            return;
          }
        } catch {
          // Retry silently
        }
      }

      // Timed out
      setStatus("done");
      toast.warning(
        "Resume parsing is taking longer than expected. You can continue and we will update your profile."
      );
    },
    [onUploadComplete]
  );

  // ------------------------------------------
  // Drag & drop handlers
  // ------------------------------------------
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) uploadFile(file);
    },
    [uploadFile]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) uploadFile(file);
      // Reset input so the same file can be re-selected
      e.target.value = "";
    },
    [uploadFile]
  );

  const handleReplace = useCallback(() => {
    inputRef.current?.click();
  }, []);

  // ------------------------------------------
  // Render: existing file uploaded
  // ------------------------------------------
  if (status === "done" && data.fileUrl) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-xl text-foreground">
            Resume Upload
          </CardTitle>
          <CardDescription>
            Your resume has been uploaded. You can replace it if needed.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="flex items-center gap-4 rounded-lg border border-border bg-background p-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
              <FileText className="h-6 w-6 text-primary" />
            </div>

            <div className="flex-1 space-y-1">
              <p className="text-sm font-medium text-foreground">
                {data.filename}
              </p>
              {data.fileSize && (
                <p className="text-xs text-muted-foreground">
                  {formatFileSize(data.fileSize)}
                </p>
              )}
            </div>

            <CheckCircle2 className="h-5 w-5 text-green-500" />
          </div>

          {/* AI parsing status */}
          {data.parsedData ? (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-3">
              <Bot className="h-4 w-4 text-primary" />
              <span className="text-sm text-foreground">
                Resume parsed successfully
              </span>
              <Badge variant="secondary" className="ml-auto text-[10px]">
                AI
              </Badge>
            </div>
          ) : null}

          <Button
            variant="outline"
            size="sm"
            onClick={handleReplace}
            className="gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Replace resume
          </Button>

          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_EXTENSIONS}
            onChange={handleFileSelect}
            className="hidden"
          />
        </CardContent>
      </Card>
    );
  }

  // ------------------------------------------
  // Render: uploading / parsing states
  // ------------------------------------------
  if (status === "uploading" || status === "parsing") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-xl text-foreground">
            Resume Upload
          </CardTitle>
        </CardHeader>

        <CardContent>
          <div className="flex flex-col items-center gap-4 py-12">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-sm font-medium text-foreground">
              {status === "uploading"
                ? "Uploading your resume..."
                : "Parsing your resume..."}
            </p>
            <p className="text-xs text-muted-foreground">
              {status === "parsing" &&
                "Our AI is extracting your skills, experience, and more."}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ------------------------------------------
  // Render: error state
  // ------------------------------------------
  if (status === "error") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-xl text-foreground">
            Resume Upload
          </CardTitle>
        </CardHeader>

        <CardContent>
          <div className="flex flex-col items-center gap-4 py-12">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <X className="h-6 w-6 text-destructive" />
            </div>
            <p className="text-sm font-medium text-foreground">
              Upload failed
            </p>
            <p className="text-xs text-muted-foreground">
              Please try again or choose a different file.
            </p>
            <Button variant="outline" size="sm" onClick={handleReplace}>
              Try Again
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED_EXTENSIONS}
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>
        </CardContent>
      </Card>
    );
  }

  // ------------------------------------------
  // Render: idle — drag & drop zone
  // ------------------------------------------
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl text-foreground">Resume Upload</CardTitle>
        <CardDescription>
          Upload your resume so our AI can pre-fill your profile. We accept PDF
          and DOCX files up to 10 MB.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <div
          role="button"
          tabIndex={0}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          className={`flex cursor-pointer flex-col items-center gap-4 rounded-lg border-2 border-dashed px-6 py-16 transition-colors ${
            isDragOver
              ? "border-primary bg-primary/5"
              : "border-border bg-background hover:border-primary/50 hover:bg-accent/50"
          }`}
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <Upload className="h-7 w-7 text-primary" />
          </div>

          <div className="space-y-1 text-center">
            <p className="text-sm font-medium text-foreground">
              Drag &amp; drop your resume here
            </p>
            <p className="text-xs text-muted-foreground">
              or click to browse files
            </p>
          </div>

          <div className="flex gap-2">
            <Badge variant="secondary">PDF</Badge>
            <Badge variant="secondary">DOCX</Badge>
            <Badge variant="outline">Max 10 MB</Badge>
          </div>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_EXTENSIONS}
          onChange={handleFileSelect}
          className="hidden"
        />
      </CardContent>
    </Card>
  );
}
