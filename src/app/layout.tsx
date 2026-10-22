import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SubscriptX — Simple subscription management",
  description: "Manage your SubscriptX plans, renewals, and billing in one place.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
