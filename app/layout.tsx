import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SwingSignal — NSE Swing Trade Assistant',
  description:
    'Private, explainable NSE bullish swing-trade research and risk planning.',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
