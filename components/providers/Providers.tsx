"use client";

import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider, useTheme } from "next-themes";
import { Toaster } from "sonner";
import { ReactNode } from "react";

function ThemedToaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Toaster
      position="bottom-right"
      richColors
      closeButton
      expand
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      duration={4000}
      gap={8}
      offset={16}
      toastOptions={{
        classNames: {
          toast: "font-sans",
          title: "text-sm font-medium",
          description: "text-xs text-muted-foreground",
          actionButton: "bg-primary text-primary-foreground text-xs font-medium px-3 py-1.5 rounded-md",
          cancelButton: "bg-muted text-muted-foreground text-xs font-medium px-3 py-1.5 rounded-md",
        },
      }}
    />
  );
}

interface ProvidersProps {
  children: ReactNode;
  /** CSP nonce for next-themes' inline theme script (Issue #14). */
  nonce?: string;
}

export function Providers({ children, nonce }: ProvidersProps) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem nonce={nonce}>
      <AuthProvider>
        {children}
        <ThemedToaster />
      </AuthProvider>
    </ThemeProvider>
  );
}
