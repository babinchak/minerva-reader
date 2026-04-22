import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import NextTopLoader from "nextjs-toploader";
import { ThemeProvider } from "next-themes";
import { PwaRegister } from "@/components/pwa-register";
import { CreditsRefreshOnSuccess } from "@/components/credits-refresh-on-success";
import { ScrollLockRepair } from "@/components/scroll-lock-repair";
import { ThemeVariantsProvider } from "@/components/theme-variants-provider";
import { MobileConsoleMirror } from "@/components/mobile-console-mirror";
import "./globals.css";

const satoshi = localFont({
  src: "../public/fonts/Satoshi-Variable.woff2",
  variable: "--font-satoshi",
  weight: "300 900",
  display: "swap",
});

const defaultUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:4000";

export const metadata: Metadata = {
  metadataBase: new URL(defaultUrl),
  title: {
    default: "Minerva Reader",
    template: "%s - Minerva Reader",
  },
  description:
    "Your personal EPUB and PDF library. Upload and read your books in one place, with AI-powered insights.",
  applicationName: "Minerva Reader",
  manifest: "/manifest.webmanifest",
  openGraph: {
    type: "website",
    siteName: "Minerva Reader",
    title: "Minerva Reader",
    description:
      "Your personal EPUB and PDF library. Upload and read your books in one place, with AI-powered insights.",
    images: [{ url: "/api/og", width: 1200, height: 630, alt: "Minerva Reader" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Minerva Reader",
    description:
      "Your personal EPUB and PDF library. Upload and read your books in one place, with AI-powered insights.",
    images: ["/api/og"],
  },
  appleWebApp: {
    capable: true,
    title: "Minerva Reader",
    statusBarStyle: "default",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

// Enable safe-area insets (notch / Dynamic Island) on iOS Safari.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f0e8" },
    { media: "(prefers-color-scheme: dark)", color: "#151210" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={satoshi.variable} suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        {/* Google Ads gtag.js */}
        <script async src={`https://www.googletagmanager.com/gtag/js?id=${process.env.NEXT_PUBLIC_GOOGLE_ADS_ID}`} />
        <script
          dangerouslySetInnerHTML={{
            __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${process.env.NEXT_PUBLIC_GOOGLE_ADS_ID}');`,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var s=localStorage.getItem("minerva-theme-variants");if(s){try{var p=JSON.parse(s);var l=p.light||"minerva";var d=p.dark||"minerva";document.documentElement.setAttribute("data-light-theme",l);document.documentElement.setAttribute("data-dark-theme",d);}catch(e){}}})();`,
          }}
        />
      </head>
      <body className="antialiased" style={{ backgroundColor: "hsl(var(--background))" }}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <NextTopLoader
            height={3}
            showSpinner={false}
            easing="ease"
            speed={200}
          />
          <ThemeVariantsProvider>
            <PwaRegister />
            <MobileConsoleMirror />
            <Suspense>
              <CreditsRefreshOnSuccess />
            </Suspense>
            <ScrollLockRepair />
            {children}
            <Analytics />
            <SpeedInsights />
          </ThemeVariantsProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
