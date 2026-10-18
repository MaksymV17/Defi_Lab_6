// Автономний бот-ліквідатор: моніторить Health Factor боржника і ліквідує його, коли HF < 1.
import { ethers } from "ethers";
import {
  env, fmt, EXPLORER, getProvider, getWallet, loadDeployment, contractAt,
} from "../scripts/common.js";

const POLL_MS = Number(env("POLL_MS", "5000"));
const provider = getProvider();
const wallet = getWallet("LIQUIDATOR_PRIVATE_KEY", provider);
const deployment = loadDeployment();
const borrower = ethers.getAddress(env("BORROWER_ADDRESS", deployment.borrower));
const engine = contractAt("StableEngine", deployment.engine, wallet);
const coin = contractAt("StableCoin", deployment.coin, wallet);

const log = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

log(`Бот запущено. Ліквідатор: ${wallet.address}`);
log(`Моніторинг боржника: ${borrower}, StableEngine: ${deployment.engine}`);

while (true) {
  try {
    const hf = await engine.healthFactor(borrower);
    const debt = await engine.debtOf(borrower);
    log(`HF = ${fmt(hf)}, борг = ${fmt(debt)}`);

    if (debt > 0n && hf < ethers.WeiPerEther) {
      log("!!! HF < 1.0 — позиція підлягає ліквідації, починаю ліквідацію");

      const balance = await coin.balanceOf(wallet.address);
      const amount = debt < balance ? debt : balance;
      if (amount === 0n) throw new Error("У ліквідатора немає стейблкоїнів для погашення боргу");

      if ((await coin.allowance(wallet.address, deployment.engine)) < amount) {
        await (await coin.approve(deployment.engine, amount)).wait();
        log("approve виконано");
      }

      const tx = await engine.liquidate(borrower, amount);
      log(`Транзакцію ліквідації надіслано: ${tx.hash}`);
      const receipt = await tx.wait();

      log(`УСПІХ: ліквідацію виконано в блоці ${receipt.blockNumber}`);
      log(`Хеш транзакції: ${tx.hash}`);
      log(`Etherscan: ${EXPLORER}/tx/${tx.hash}`);
      log(`Залишок боргу: ${fmt(await engine.debtOf(borrower))}, ` +
          `залишок застави: ${ethers.formatEther(await engine.collateralDeposited(borrower))} ETH`);
      break;
    }
  } catch (err) {
    log(`Помилка: ${err.shortMessage ?? err.message}`);
  }
  await sleep(POLL_MS);
}
