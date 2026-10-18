import { ethers } from "ethers";
import {
  SURNAME, ETH_USD_FEED, EXPLORER,
  getProvider, getWallet, loadArtifact, saveDeployment,
} from "./common.js";

const provider = getProvider();
const deployer = getWallet("PRIVATE_KEY", provider);
const name = `${SURNAME}USD`;

console.log(`Мережа: ${(await provider.getNetwork()).name}, гаманець: ${deployer.address}`);
console.log(`Баланс: ${ethers.formatEther(await provider.getBalance(deployer.address))} ETH\n`);

async function deploy(contractName, args) {
  const { abi, bytecode } = loadArtifact(contractName);
  const contract = await new ethers.ContractFactory(abi, bytecode, deployer).deploy(...args);
  await contract.waitForDeployment();
  return contract;
}

const coin = await deploy("StableCoin", [name, name]);
console.log(`${name} (StableCoin): ${await coin.getAddress()}`);

const engine = await deploy("StableEngine", [await coin.getAddress(), ETH_USD_FEED]);
console.log(`StableEngine:          ${await engine.getAddress()}`);
console.log(`Оракул Chainlink:      ${ETH_USD_FEED}`);

await (await coin.transferOwnership(await engine.getAddress())).wait();
console.log(`Власника токена передано StableEngine`);

saveDeployment({
  coin: await coin.getAddress(),
  engine: await engine.getAddress(),
  feed: ETH_USD_FEED,
  borrower: deployer.address,
});
console.log(`\nEtherscan: ${EXPLORER}/address/${await engine.getAddress()}`);
console.log("Адреси збережено у deployment.json");
