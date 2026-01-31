import type { Metadata } from 'next'
import { Providers } from './providers'
import './globals.css'

export const metadata: Metadata = {
  title: 'SwapStats | Onchain Swap Analytics for Uniswap V4',
  description: 'Track swap statistics onchain. Volume, counts, timestamps—no indexer required.',
  openGraph: {
    title: 'SwapStats | Onchain Swap Analytics for Uniswap V4',
    description: 'Track swap statistics onchain. Volume, counts, timestamps—no indexer required.',
    url: 'https://afterswap.v4hooks.dev',
  },
  themeColor: '#00ffd0',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
