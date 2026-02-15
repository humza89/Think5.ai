"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

export default function ResumeUploadButton({ candidateId }: { candidateId: string }) {
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("candidateId", candidateId);

      const response = await fetch("/api/upload-resume", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Upload failed");
      }

      // Refresh the page to show the new resume
      router.refresh();
    } catch (error) {
      console.error("Error uploading resume:", error);
      alert("Failed to upload resume. Please try again.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.doc,.docx"
        onChange={handleFileChange}
        className="hidden"
        id="resume-upload"
      />
      <label
        htmlFor="resume-upload"
        className={`block text-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors cursor-pointer ${
          isUploading ? "opacity-50 cursor-not-allowed" : ""
        }`}
      >
        {isUploading ? "Uploading..." : "Upload Resume"}
      </label>
    </>
  );
}
