import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Viseoweb HUB',
  description: 'Plateforme de gestion de sites comparatifs automatisés',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body style={{ margin: 0, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#0A0E1A', color: '#E2E8F0' }}>
        {children}
      </body>
    </html>
  )
}
