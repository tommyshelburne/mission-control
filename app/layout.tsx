import type { Metadata } from 'next';
import { Sidebar } from '@/components/layout/Sidebar';
import { Providers } from '@/components/Providers';
import { QuickCapture } from '@/components/layout/QuickCapture';
import { CommandPalette } from '@/components/layout/CommandPalette';
import './globals.css';

export const metadata: Metadata = {
  title: 'Mission Control',
  description: 'OpenClaw Mission Control v4',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="flex h-screen overflow-hidden">
        <Providers>
          <Sidebar />
          <main className="flex-1 flex flex-col overflow-hidden min-w-0">
            {children}
          </main>
          <QuickCapture />
          <CommandPalette />
        </Providers>
      </body>
    </html>
  );
}
