import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Comparatifs — Dashboard',
  description: 'Plateforme de gestion des sites comparatifs',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  )
}
