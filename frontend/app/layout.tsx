import type { Metadata } from 'next'
import { Providers } from './providers'
import './globals.css'

export const metadata: Metadata = {
  title: 'SwapStats Hook | Uniswap v4',
  description: 'Real-time swap statistics for Uniswap v4 pools using hooks',
  openGraph: {
    title: 'SwapStats Hook | Uniswap v4',
    description: 'Real-time swap statistics for Uniswap v4 pools using hooks',
    url: 'https://hook1.v4hooks.dev',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="min-h-screen gradient-bg">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
