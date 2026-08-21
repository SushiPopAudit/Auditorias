import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AppProvider } from '@/contexts/AppContext';
import DataLoader from '@/components/DataLoader';

export const metadata: Metadata = {
  title: 'Ausitoria',
  description: 'Sistema de auditorías SushiPop',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'black', title: 'Ausitoria' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#e4001b',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="bg-gray-50 min-h-screen">
        <AppProvider>
          <DataLoader />
          {children}
        </AppProvider>
      </body>
    </html>
  );
}
