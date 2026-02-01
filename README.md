# afterSwap

A Uniswap v4 hook that tracks real-time swap statistics for any pool — on-chain, without external indexers.

**Live Demo:** [afterswap.v4hooks.dev](https://afterswap.v4hooks.dev)

## What This Hook Does

- Tracks **total swap count** per pool
- Records **cumulative volume** in both tokens
- Stores **last swap timestamp**
- Emits `SwapRecorded` events for real-time updates

## Why This Showcases v4 Hooks

| Feature | Benefit |
|---------|---------|
| **On-chain analytics** | No subgraph or external indexer needed |
| **Minimal permissions** | Only uses `afterSwap` (safest hook type) |
| **Gas efficient** | Just increments counters after swaps |
| **Composable** | Any pool can opt-in to this hook |

## Hook Permissions

```solidity
afterSwap: true     // ✅ Only permission enabled
beforeSwapReturnDelta: false  // ⛔ Never enabled (rug risk)
```

## Project Structure

```
afterSwap/
├── src/SwapStats.sol      # The hook contract
├── test/SwapStats.t.sol   # Foundry tests
├── script/                # Deployment scripts
└── frontend/              # Next.js UI
```

## Getting Started

### Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation)
- Node.js 18+

### Install Dependencies

```bash
# Contracts
forge install

# Frontend
cd frontend && npm install
```

### Run Tests

```bash
forge test -vvv
```

### Local Development

```bash
# Start frontend
cd frontend && npm run dev
```

## Deployment

### Deploy Hook to Base Sepolia

```bash
cp .env.example .env
# Edit .env with your PRIVATE_KEY and BASESCAN_API_KEY

forge script script/00_DeployHook.s.sol \
  --rpc-url base_sepolia \
  --broadcast \
  --verify
```

### Deploy Frontend to Vercel

The frontend is configured for Vercel deployment. Connect your GitHub repo and set the root directory to `frontend`.

## Contract Addresses

| Network | Address |
|---------|---------|
| Base Mainnet | `0x0b9bD21322063AA5e8eE09a54AeA4C90a4A08040` |

## Learn More

This hook is part of [v4hooks.dev](https://v4hooks.dev) — a collection of Uniswap v4 hooks for learning.

Built with the [Uniswap v4 Hooks Skill](https://github.com/igoryuzo/uniswapV4-hooks-skill) for Claude Code.

## Security

This is a minimal, read-only hook with no ability to:
- Modify swap amounts
- Take user tokens
- Block transactions

It only observes completed swaps and updates counters.

## License

MIT
