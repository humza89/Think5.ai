import type { Metadata } from "next";
import { headers } from "next/headers";
import { Inter, Instrument_Serif } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers/Providers";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const display = Instrument_Serif({
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: "Think5 - AI Recruiting Platform",
  description: "Think5 is an enterprise AI recruiting platform for sourcing, vetting, and hiring top talent with AI-powered interviews and analytics.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Issue #14: proxy.ts issues a per-request CSP nonce for app routes and
  // forwards it as x-nonce. Next.js stamps its own scripts from the CSP
  // request header; the theme provider's FOUC-prevention inline script is
  // ours, so it receives the nonce explicitly. Reading headers() here makes
  // every route render per request (see docs/ops/csp.md, "Caching").
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${display.variable} font-sans antialiased`}
        suppressHydrationWarning
      >
        <Providers nonce={nonce}>{children}</Providers>
      </body>
    </html>
  );
}
