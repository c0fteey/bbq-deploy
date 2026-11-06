import {Geist, Geist_Mono} from 'next/font/google';
import {Toaster} from '@/components/ui/sonner';
import './globals.css';

const geistSans = Geist({variable: '--font-sans', subsets: ['latin', 'latin-ext']});
const geistMono = Geist_Mono({variable: '--font-geist-mono', subsets: ['latin', 'latin-ext']});

export const metadata = {
  title: 'bbq-deploy',
  description: 'Barbeque botunun güncelleme paneli',
  robots: {index: false, follow: false},
};

export default function RootLayout({children}) {
  return (
    <html lang="tr" className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-background text-foreground">
        {children}
        <Toaster position="bottom-right" />
      </body>
    </html>
  );
}
