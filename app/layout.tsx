import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import type { ReactNode } from "react";

import "./page.css";

const geistSans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

/** Page metadata. The page shows secrets, so search engines must not index it. */
export const metadata: Metadata = {
  title: "System dump",
  description: "Request headers, environment variables, and host data for one request",
  robots: { index: false, follow: false },
};

/**
 * Root layout. Loads the brand stylesheet from vercel.com/design.md and the Geist fonts.
 *
 * @param props The layout props.
 * @param props.children The page content.
 * @returns The HTML document.
 *
 * @example
 * <RootLayout><Page /></RootLayout>
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`} style={{ colorScheme: "dark" }}>
      <body className="vbg-report" data-theme="dark">
        <link rel="stylesheet" href="https://vercel.com/geist/vercel-brand.css" precedence="vbg" />
        {children}
      </body>
    </html>
  );
}
