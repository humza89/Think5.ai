"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface ResumeUploadProps {
  candidateId: string;
  hasResume?: boolean;
}

export default function ResumeUpload({ candidateId, hasResume = false }: ResumeUploadProps) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword",
    ];

    if (!validTypes.includes(file.type)) {
      setError("Please upload a PDF or DOCX file");
      return;
    }

    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      setError("File size must be less than 10MB");
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(`/api/candidates/${candidateId}/resume`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to upload resume");
      }

      // Refresh the page to show the new resume
      router.refresh();
    } catch (err: any) {
      setError(err.message || "Failed to upload resume");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <label
        htmlFor="resume-upload"
        className={`
          inline-flex items-center px-4 py-2 border border-gray-300
          rounded-md shadow-sm text-sm font-medium text-gray-700
          bg-white hover:bg-gray-50 focus:outline-none focus:ring-2
          focus:ring-offset-2 focus:ring-blue-500 cursor-pointer
          ${uploading ? "opacity-50 cursor-not-allowed" : ""}
        `}
      >
        {uploading ? (
          <>
            <svg
              className="animate-spin -ml-1 mr-3 h-5 w-5 text-gray-700"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
            Uploading & Parsing...
          </>
        ) : (
          <>
            <svg
              className="-ml-1 mr-2 h-5 w-5 text-gray-700"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
            {hasResume ? "Reupload" : "Upload Resume"}
          </>
        )}
      </label>
      <input
        id="resume-upload"
        type="file"
        className="hidden"
        accept=".pdf,.doc,.docx"
        onChange={handleFileUpload}
        disabled={uploading}
      />

      {error && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-md">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg
                className="h-5 w-5 text-red-400"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          </div>
        </div>
      )}

      {!hasResume && (
        <>
          <p className="mt-2 text-xs text-gray-500">
            Supported formats: PDF, DOC, DOCX (max 10MB)
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Resume will be automatically parsed to extract contact details, skills, and experience.
          </p>
        </>
      )}
    </div>
  );
}
