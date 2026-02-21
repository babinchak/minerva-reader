import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "next-themes";
import { PwaRegister } from "@/components/pwa-register";
import { CreditsRefreshOnSuccess } from "@/components/credits-refresh-on-success";
import { ScrollLockRepair } from "@/components/scroll-lock-repair";
import { ThemeVariantsProvider } from "@/components/theme-variants-provider";
import "./globals.css";

const defaultUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(defaultUrl),
  title: "Minerva Reader",
  description:
    "Your personal EPUB and PDF library. Upload and read your books in one place.",
  applicationName: "Minerva Reader",
  manifest: "/manifest.webmanifest",
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
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var s=localStorage.getItem("minerva-theme-variants");if(s){try{var p=JSON.parse(s);var l=p.light||"minerva";var d=p.dark||"minerva";document.documentElement.setAttribute("data-light-theme",l);document.documentElement.setAttribute("data-dark-theme",d);}catch(e){}}})();`,
          }}
        />
      </head>
      <body className="antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <ThemeVariantsProvider>
            <PwaRegister />
            <CreditsRefreshOnSuccess />
            <ScrollLockRepair />
            {children}
          </ThemeVariantsProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
