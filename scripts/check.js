import { ethers } from "ethers";
import { getProvider, getWallet, loadDeployment, contractAt, fmt } from "./common.js";

const provider = getProvider();
const w = getWallet("PRIVATE_KEY", provider);
const d = loadDeployment();

console.log("Мережа chainId:", (await provider.getNetwork()).chainId);
console.log("Гаманець:", w.address, "баланс:", ethers.formatEther(await provider.getBalance(w.address)), "ETH");
console.log("deployment.json:", d);
console.log("Код за адресою engine:", (await provider.getCode(d.engine)).length > 2 ? "є" : "ПОРОЖНЬО");
console.log("Код за адресою coin:  ", (await provider.getCode(d.coin)).length > 2 ? "є" : "ПОРОЖНЬО");

const engine = contractAt("StableEngine", d.engine, w);
console.log("engine.owner():", await engine.owner());
console.log("engine.stableCoin():", await engine.stableCoin());
console.log("Ціна ETH з оракула: $" + fmt(await engine.getEthPriceUsd()));