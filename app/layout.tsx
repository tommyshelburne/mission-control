import type { Metadata } from 'next';
import { AppShell } from '@/components/layout/AppShell';
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
      <body className="h-screen overflow-hidden">
        <Providers>
          <AppShell>{children}</AppShell>
          <QuickCapture />
          <CommandPalette />
        </Providers>
      </body>
    </html>
  );
}
