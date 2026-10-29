import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { ThemeProvider } from "next-themes";
import "./globals.css";
import { TopBar } from "@/components/layout/TopBar";
import { Sidebar } from "@/components/navigation/Sidebar";
import { BottomNavigation } from "@/components/navigation/BottomNavigation";
import { FloatingAddButton } from "@/components/navigation/FloatingAddButton";
import { siteMetadataBase } from "@/lib/site-metadata";

export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };

  
export const metadata: Metadata = {
  metadataBase: siteMetadataBase(),
  title: "Rotina",
  description: "Organização pessoal, projetos e planejamento",
};

const geistSans = Geist({
  variable: "--font-geist-sans",
  display: "swap",
  subsets: ["latin"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={`${geistSans.variable} bg-background font-sans text-foreground`}>
        <ThemeProvider
          attribute="class"
          storageKey="rotina-theme"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <div className="flex min-h-screen">
            <Suspense fallback={<div aria-hidden="true" className="hidden min-h-screen w-64 shrink-0 border-r bg-surface xl:block" />}><Sidebar /></Suspense>

            <main className="min-w-0 flex-1 pb-[calc(10rem+env(safe-area-inset-bottom))] xl:pb-24">
              <Suspense fallback={<div aria-hidden="true" className="h-16 border-b bg-surface" />}><TopBar /></Suspense>
              <div className="mx-auto max-w-7xl p-4 md:p-8">
                {children}
              </div>
            </main>

            <Suspense fallback={null}><FloatingAddButton /></Suspense>
            <Suspense fallback={<div aria-hidden="true" className="fixed bottom-0 left-0 right-0 h-14 border-t bg-card xl:hidden" />}><BottomNavigation /></Suspense>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
