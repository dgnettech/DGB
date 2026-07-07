import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://dgb-internal.vercel.app"),
  title: {
    default: "DGB — Dunne Group Bank",
    template: "%s | DGB",
  },
  description:
    "Private internal banking and loan-management platform for Dunne Group Bank: member contributions, ledger balances, internal loans, repayments, documents, approvals and audit trails.",
  robots: {
    index: false,
    follow: false,
  },
  openGraph: {
    title: "DGB — Dunne Group Bank",
    description: "Secure private family-and-friends financial pool management platform.",
    url: "https://dgb-internal.vercel.app",
    siteName: "DGB",
    locale: "en_ZA",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-ZA" className={`${plusJakarta.variable} h-full antialiased`}>
      <body className="min-h-full overflow-x-hidden">{children}</body>
    </html>
  );
}
