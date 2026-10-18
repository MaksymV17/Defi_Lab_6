import { ethers } from "ethers";
import {
  env, fmt, getProvider, getWallet, loadDeployment, contractAt,
} from "./common.js";

const provider = getProvider();
const borrower = getWallet("PRIVATE_KEY", provider);
const liquidator = getWallet("LIQUIDATOR_PRIVATE_KEY", provider);
const d = loadDeployment();
const engine = contractAt("StableEngine", d.engine, borrower);
const coin = contractAt("StableCoin", d.coin, borrower);

// 1) Депозит
const depositEth = env("DEPOSIT_ETH", "0.05");
await (await engine.depositCollateral({ value: ethers.parseEther(depositEth) })).wait();
console.log(`1) Депозит: ${depositEth} ETH`);

// 2) Емісія так, щоб Health Factor ≈ 1.1  =>  борг = (50% вартості застави) / 1.1
const collateralUsd = await engine.getCollateralValueUsd(borrower.address);
const targetDebt = (collateralUsd * 50n * 10n) / (100n * 11n);
const toMint = targetDebt - (await engine.debtOf(borrower.address));
await (await engine.mintStablecoin(toMint)).wait();
console.log(`2) Вартість застави: $${fmt(collateralUsd)}, випущено ${fmt(toMint)}`);
console.log(`   Health Factor: ${fmt(await engine.healthFactor(borrower.address))}`);

// 3) Передаємо стейблкоїни ліквідатору, щоб він міг погасити борг, + трохи ETH на газ
const balance = await coin.balanceOf(borrower.address);
await (await coin.transfer(liquidator.address, balance)).wait();
console.log(`3) Ліквідатору ${liquidator.address} передано ${fmt(balance)} токенів`);

if ((await provider.getBalance(liquidator.address)) < ethers.parseEther("0.01")) {
  await (await borrower.sendTransaction({ to: liquidator.address, value: ethers.parseEther("0.02") })).wait();
  console.log("   Ліквідатору надіслано 0.02 ETH на газ");
}

console.log(`\nБоржник: ${borrower.address}`);
