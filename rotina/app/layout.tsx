import { Suspense } from "react";
import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { ThemeProvider } from "next-themes";
import "./globals.css";
import { TopBar } from "@/components/layout/TopBar";
import { Sidebar } from "@/components/navigation/Sidebar";
import { BottomNavigation } from "@/components/navigation/BottomNavigation";
import { FloatingAddButton } from "@/components/navigation/FloatingAddButton";

const defaultUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:3000";

  
export const metadata: Metadata = {
  metadataBase: new URL(defaultUrl),
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
            <Suspense fallback={<div aria-hidden="true" className="hidden min-h-screen w-64 shrink-0 border-r bg-surface md:block" />}><Sidebar /></Suspense>

            <main className="min-w-0 flex-1 pb-20 md:pb-0">
              <Suspense fallback={<div aria-hidden="true" className="h-16 border-b bg-surface" />}><TopBar /></Suspense>
              <div className="mx-auto max-w-7xl p-4 md:p-8">
                {children}
              </div>
            </main>

            <FloatingAddButton />
            <Suspense fallback={<div aria-hidden="true" className="fixed bottom-0 left-0 right-0 h-14 border-t bg-card md:hidden" />}><BottomNavigation /></Suspense>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
