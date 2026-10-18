# Лабораторна робота № 6 — бот-ліквідатор (Sepolia)

Виконав: Вертій Максим

## Запуск

1. `npm install`
2. Скопіюйте `.env.example` у `.env` і заповніть (RPC, два приватні ключі з Sepolia ETH).
3. `npx hardhat compile`
4. `npm run deploy` — розгортання StableCoin (VertiiUSD) і StableEngine з оракулом Chainlink.
5. `npm run open` — депозит, емісія з Health Factor ≈ 1.1, передача токенів ліквідатору.
6. У окремому терміналі: `npm run bot` — бот моніторить боржника.
7. У першому терміналі: `npm run crash` — бекдор зменшує заставу, HF < 1.0, бот ліквідує.
