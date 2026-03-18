"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
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
  FileText,
  Upload,
  Download,
  Trash2,
  Plus,
  File,
  Clock,
  Loader2,
} from "lucide-react";

interface Document {
  id: string;
  filename: string;
  type: string;
  size: number;
  url: string;
  uploadedAt: string;
}

const typeColors: Record<string, string> = {
  Resume: "bg-blue-400/10 text-blue-400 border-blue-400/20",
  "Cover Letter": "bg-green-400/10 text-green-400 border-green-400/20",
  Certification: "bg-purple-400/10 text-purple-400 border-purple-400/20",
  Other: "bg-amber-400/10 text-amber-400 border-amber-400/20",
};

const typeIcons: Record<string, React.ElementType> = {
  Resume: FileText,
  "Cover Letter": File,
  Certification: File,
  Other: File,
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [docType, setDocType] = useState("Resume");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/candidate/documents");
      if (res.ok) {
        const data = await res.json();
        setDocuments(data.documents || []);
      }
    } catch {
      toast.error("Failed to load documents");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setSelectedFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0] || null;
    if (file) setSelectedFile(file);
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      toast.error("Please select a file");
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("type", docType);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        toast.success("Document uploaded successfully");
        setDialogOpen(false);
        setSelectedFile(null);
        setDocType("Resume");
        fetchDocuments();
      } else {
        toast.error("Failed to upload document");
      }
    } catch {
      toast.error("An error occurred during upload");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/candidate/documents?id=${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast.success("Document deleted");
        setDocuments((prev) => prev.filter((d) => d.id !== id));
      } else {
        toast.error("Failed to delete document");
      }
    } catch {
      toast.error("An error occurred");
    } finally {
      setDeletingId(null);
    }
  };

  const handleDownload = (doc: Document) => {
    window.open(doc.url, "_blank");
  };

  return (
    <div>
      <div className="container mx-auto px-6">
        {/* Page Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2">Documents</h1>
            <p className="text-muted-foreground">
              Manage your resumes, cover letters, and certifications.
            </p>
          </div>
          <Button
            onClick={() => setDialogOpen(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl"
          >
            <Upload className="w-4 h-4 mr-1.5" />
            Upload Document
          </Button>
        </div>

        {/* Documents Grid */}
        {loading ? (
          <div className="rounded-2xl border border-border bg-card p-12 text-center">
            <div className="w-8 h-8 border-2 border-border border-t-muted-foreground rounded-full animate-spin mx-auto mb-4" />
            <p className="text-muted-foreground">Loading documents...</p>
          </div>
        ) : documents.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-12 text-center">
            <FileText className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">
              No documents uploaded
            </h3>
            <p className="text-muted-foreground text-sm mb-6">
              Upload your resume to get started.
            </p>
            <Button
              onClick={() => setDialogOpen(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl"
            >
              <Upload className="w-4 h-4 mr-1.5" />
              Upload Your First Document
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {documents.map((doc) => {
              const Icon = typeIcons[doc.type] || typeIcons.Other;
              return (
                <Card
                  key={doc.id}
                  className="border-border bg-card shadow-none hover:bg-accent transition-colors"
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0">
                          <Icon className="w-5 h-5 text-blue-400" />
                        </div>
                        <div className="min-w-0">
                          <CardTitle className="text-foreground text-sm font-semibold truncate">
                            {doc.filename}
                          </CardTitle>
                          <Badge
                            className={cn(
                              "mt-1 text-xs",
                              typeColors[doc.type] || typeColors.Other
                            )}
                          >
                            {doc.type}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-4">
                      <span>{formatFileSize(doc.size)}</span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(doc.uploadedAt).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDownload(doc)}
                        className="flex-1 border-border text-foreground hover:bg-accent rounded-lg text-xs"
                      >
                        <Download className="w-3.5 h-3.5 mr-1" />
                        Download
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDelete(doc.id)}
                        disabled={deletingId === doc.id}
                        className="border-red-500/20 text-red-400 hover:bg-red-500/10 rounded-lg text-xs"
                      >
                        {deletingId === doc.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Upload Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="bg-background border-border">
            <DialogHeader>
              <DialogTitle>Upload Document</DialogTitle>
              <DialogDescription>
                Upload a resume, cover letter, or certification.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              {/* File Dropzone */}
              <div>
                <Label className="mb-2 block">File</Label>
                <div
                  onDrop={handleDrop}
                  onDragOver={(e) => e.preventDefault()}
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    "rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-colors",
                    selectedFile
                      ? "border-blue-500/40 bg-blue-500/5"
                      : "border-border hover:border-muted-foreground/30"
                  )}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  {selectedFile ? (
                    <div>
                      <FileText className="w-8 h-8 text-blue-500 mx-auto mb-2" />
                      <p className="font-medium text-sm">{selectedFile.name}</p>
                      <p className="text-muted-foreground text-xs mt-1">
                        {formatFileSize(selectedFile.size)}
                      </p>
                    </div>
                  ) : (
                    <div>
                      <Upload className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">
                        Drop a file here or click to browse
                      </p>
                      <p className="text-xs text-muted-foreground/60 mt-1">
                        PDF, DOC, DOCX, PNG, JPG
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Document Type */}
              <div>
                <Label className="mb-2 block">Document Type</Label>
                <Select value={docType} onValueChange={setDocType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Resume">Resume</SelectItem>
                    <SelectItem value="Cover Letter">Cover Letter</SelectItem>
                    <SelectItem value="Certification">Certification</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setDialogOpen(false);
                  setSelectedFile(null);
                  setDocType("Resume");
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleUpload}
                disabled={!selectedFile || uploading}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {uploading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                Upload
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
