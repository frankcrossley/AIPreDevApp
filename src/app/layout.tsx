import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pre-dev workspace",
  description: "Turn raw input into backlog items that are Ready to build.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
