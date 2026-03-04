import { Outfit } from 'next/font/google';
import type { Metadata } from 'next';
import './globals.css';

import { SidebarProvider } from '@/context/SidebarContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { MsalProvider } from '@/lib/msal/MsalProvider';
import { AuthProvider } from '@/context/AuthContext';
import { AuthGuard } from '@/components/auth';

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

const outfit = Outfit({
  subsets: ["latin"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${outfit.className} dark:bg-gray-900`}>
        <MsalProvider>
          <AuthProvider>
            <ThemeProvider>
              <AuthGuard>
                <SidebarProvider>{children}</SidebarProvider>
              </AuthGuard>
            </ThemeProvider>
          </AuthProvider>
        </MsalProvider>
      </body>
    </html>
  );
}
