import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PuffPing — High-volume SMS & MMS marketing",
  description:
    "Send compliant mass text campaigns at scale. Carrier-approved 10DLC sending, toll-free verification, a two-way inbox, MMS, dynamic fields, and reporting — built on Twilio.",
  icons: { icon: "/puff-ping-logo.png", apple: "/puff-ping-logo.png" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-zinc-950 text-zinc-100 antialiased">{children}</body>
    </html>
  );
}
