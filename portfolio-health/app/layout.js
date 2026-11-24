import './globals.css';

export const metadata = {
  title: 'Portfolio health checkup',
  description: 'Account health, renewal risk and call priorities for a KAM portfolio',
  robots: { index: false, follow: false }
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
