// Minimal layout — this app is API-only.
// Cocos game is served from public/game/ as static files.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
