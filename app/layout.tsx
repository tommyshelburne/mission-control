import type { Metadata } from 'next';
import { Sidebar } from '@/components/layout/Sidebar';
import { Providers } from '@/components/Providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'Mission Control',
  description: 'OpenClaw Mission Control v3',
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
        </Providers>
      </body>
    </html>
  );
}
