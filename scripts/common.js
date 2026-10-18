import fs from "node:fs";
import path from "node:path";
import { ethers } from "ethers";

// !!! Прізвище латиницею -> токен <Прізвище>USD
export const SURNAME = "Vertii";
// Chainlink ETH/USD на Sepolia
export const ETH_USD_FEED = "0x694AA1769357215DE4FAC081bf1f309aDC325306";
export const EXPLORER = "https://sepolia.etherscan.io";

export function env(name, fallback) {
  const v = process.env[name] ?? fallback;
  if (!v) throw new Error(`Задайте ${name} у файлі .env`);
  return v;
}

export function getProvider() {
  return new ethers.JsonRpcProvider(env("SEPOLIA_RPC_URL"));
}

export function getWallet(keyName, provider) {
  return new ethers.Wallet(env(keyName), provider);
}

export function loadArtifact(name) {
  const file = path.resolve("artifacts", "contracts", `${name}.sol`, `${name}.json`);
  if (!fs.existsSync(file)) throw new Error(`Немає ${file}. Спочатку виконайте: npx hardhat compile`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function saveDeployment(data) {
  fs.writeFileSync("deployment.json", JSON.stringify(data, null, 2));
}

export function loadDeployment() {
  if (!fs.existsSync("deployment.json")) throw new Error("Немає deployment.json. Спочатку: npm run deploy");
  return JSON.parse(fs.readFileSync("deployment.json", "utf8"));
}

export function contractAt(name, address, signerOrProvider) {
  return new ethers.Contract(address, loadArtifact(name).abi, signerOrProvider);
}

export const fmt = (v) => ethers.formatUnits(v, 18);
