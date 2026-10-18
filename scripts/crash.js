import { fmt, getProvider, getWallet, loadDeployment, contractAt } from "./common.js";

// Імітація краху: бекдор-функція зменшує заставу боржника в реєстрі, щоб HF став ≈ 0.9
const provider = getProvider();
const owner = getWallet("PRIVATE_KEY", provider);
const d = loadDeployment();
const engine = contractAt("StableEngine", d.engine, owner);

const collateral = await engine.collateralDeposited(d.borrower);
console.log(`HF до краху: ${fmt(await engine.healthFactor(d.borrower))}`);

// Потрібне HF = 0.9 при поточному ≈ 1.1  =>  нова застава = стара * 9/11
const reduceBy = collateral - (collateral * 9n) / 11n;
const tx = await engine.debugReduceCollateral(d.borrower, reduceBy);
await tx.wait();

console.log(`debugReduceCollateral виконано, tx: ${tx.hash}`);
console.log(`HF після краху: ${fmt(await engine.healthFactor(d.borrower))}`);
