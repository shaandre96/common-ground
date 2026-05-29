import { Analytics } from "@vercel/analytics/next";
import type { Metadata } from "next";
import { DM_Sans, Lora } from "next/font/google";
import "./globals.css";

const lora = Lora({
  subsets: ["latin"],
  variable: "--font-lora",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "CommonGround — Find someone who sees it differently",
  description:
    "CommonGround matches you with a stranger who holds a different view. No algorithms gaming your feed. Just two people, one topic, and an open mind.",
  generator: "v0.app",
  icons: {
    icon: [
      {
        url: "/cg-logos/favicons/favicon-light-16.png",
        media: "(prefers-color-scheme: light)",
        sizes: "16x16",
        type: "image/png",
      },
      {
        url: "/cg-logos/favicons/favicon-light-32.png",
        media: "(prefers-color-scheme: light)",
        sizes: "32x32",
        type: "image/png",
      },
      {
        url: "/cg-logos/favicons/favicon-light-512.png",
        media: "(prefers-color-scheme: light)",
        sizes: "512x512",
        type: "image/png",
      },
      {
        url: "/cg-logos/favicons/favicon-dark-16.png",
        media: "(prefers-color-scheme: dark)",
        sizes: "16x16",
        type: "image/png",
      },
      {
        url: "/cg-logos/favicons/favicon-dark-32.png",
        media: "(prefers-color-scheme: dark)",
        sizes: "32x32",
        type: "image/png",
      },
      {
        url: "/cg-logos/favicons/favicon-dark-512.png",
        media: "(prefers-color-scheme: dark)",
        sizes: "512x512",
        type: "image/png",
      },
    ],
    apple: [
      {
        url: "/cg-logos/favicons/favicon-light-180.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${lora.variable} ${dmSans.variable}`}>
      <body className="font-sans antialiased">
        {children}
        {process.env.NODE_ENV === "production" && <Analytics />}
      </body>
    </html>
  );
}
