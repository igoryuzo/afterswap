'use client'

import { useAccount, useConnect, useDisconnect } from 'wagmi'

export function ConnectButton() {
  const { address, isConnected } = useAccount()
  const { connect, connectors } = useConnect()
  const { disconnect } = useDisconnect()

  if (isConnected) {
    return (
      <button
        onClick={() => disconnect()}
        className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl border border-white/20 transition-all text-sm font-medium"
      >
        {address?.slice(0, 6)}...{address?.slice(-4)}
      </button>
    )
  }

  return (
    <button
      onClick={() => connect({ connector: connectors[0] })}
      className="px-4 py-2 bg-uni-pink hover:bg-uni-pink-dark rounded-xl transition-all text-sm font-medium text-white"
    >
      Connect Wallet
    </button>
  )
}
