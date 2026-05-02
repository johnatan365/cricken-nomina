import type { Metadata } from 'next'
import { Baloo_2, Nunito } from 'next/font/google'
import './globals.css'

const baloo = Baloo_2({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['400', '600', '700', '800'],
})

const nunito = Nunito({
  subsets: ['latin'],
  variable: '--font-body',
  weight: ['400', '500', '600', '700'],
})

export const metadata: Metadata = {
  title: 'Cricken Nomina',
  description: 'Sistema de gestion de nomina para Cricken',
  icons: {
    icon: '/icon-Cricken.png',
    apple: '/icon-Cricken.png',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es">
      <body className={`${baloo.variable} ${nunito.variable} font-body bg-brand-purple-dark min-h-screen`}>
        {children}
      </body>
    </html>
  )
}
