// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {StableCoin} from "./StableCoin.sol";
import {AggregatorV3Interface} from "./interfaces/AggregatorV3Interface.sol";

/// @notice Кредитний протокол: ETH як застава -> емісія стейблкоїна.
/// Ціна ETH береться з оракула Chainlink (ETH/USD).
/// Перезабезпечення 200%: борг <= 50% вартості застави.
contract StableEngine is Ownable, ReentrancyGuard {
    error StableEngine__NeedsMoreThanZero();
    error StableEngine__BreaksHealthFactor(uint256 healthFactor);
    error StableEngine__HealthFactorOk(uint256 healthFactor);
    error StableEngine__NotEnoughCollateral();
    error StableEngine__BurnExceedsDebt();
    error StableEngine__InvalidPrice();
    error StableEngine__TransferFailed();

    uint256 public constant LIQUIDATION_THRESHOLD = 50; // 50% вартості застави
    uint256 public constant LIQUIDATION_PRECISION = 100;
    uint256 public constant LIQUIDATION_BONUS = 10; // 10% бонус ліквідатору
    uint256 public constant MIN_HEALTH_FACTOR = 1e18;
    uint256 public constant PRECISION = 1e18;
    uint256 private constant FEED_PRECISION = 1e10; // 8 decimals оракула -> 18

    StableCoin public immutable stableCoin;
    AggregatorV3Interface public immutable priceFeed;

    /// @notice Реєстр застав користувачів (wei).
    mapping(address => uint256) public collateralDeposited;
    /// @notice Борг користувачів у стейблкоїнах (18 decimals).
    mapping(address => uint256) public debtOf;

    event CollateralDeposited(address indexed user, uint256 amount);
    event CollateralWithdrawn(address indexed user, uint256 amount);
    event StablecoinMinted(address indexed user, uint256 amount);
    event StablecoinBurned(address indexed user, uint256 amount);
    event Liquidated(address indexed user, address indexed liquidator, uint256 debtCovered, uint256 collateralSeized);
    event DebugCollateralReduced(address indexed user, uint256 amount);

    constructor(StableCoin coin, address priceFeedAddress) Ownable(msg.sender) {
        stableCoin = coin;
        priceFeed = AggregatorV3Interface(priceFeedAddress);
    }

    modifier moreThanZero(uint256 amount) {
        if (amount == 0) revert StableEngine__NeedsMoreThanZero();
        _;
    }

    // ---------------------------------------------------------------- основні функції

    function depositCollateral() external payable moreThanZero(msg.value) {
        collateralDeposited[msg.sender] += msg.value;
        emit CollateralDeposited(msg.sender, msg.value);
    }

    function mintStablecoin(uint256 amount) external moreThanZero(amount) {
        debtOf[msg.sender] += amount;
        _revertIfHealthFactorIsBroken(msg.sender);
        stableCoin.mint(msg.sender, amount);
        emit StablecoinMinted(msg.sender, amount);
    }

    /// @notice Користувач повертає стейблкоїни (потрібен approve), вони спалюються, борг зменшується.
    function burnStablecoin(uint256 amount) external moreThanZero(amount) nonReentrant {
        if (amount > debtOf[msg.sender]) revert StableEngine__BurnExceedsDebt();
        debtOf[msg.sender] -= amount;
        _pullAndBurn(msg.sender, amount);
        emit StablecoinBurned(msg.sender, amount);
    }

    /// @notice Користувач знімає частину застави; позиція має лишитись здоровою.
    function withdrawCollateral(uint256 amount) external moreThanZero(amount) nonReentrant {
        if (amount > collateralDeposited[msg.sender]) revert StableEngine__NotEnoughCollateral();
        collateralDeposited[msg.sender] -= amount;
        _revertIfHealthFactorIsBroken(msg.sender);
        _sendEth(msg.sender, amount);
        emit CollateralWithdrawn(msg.sender, amount);
    }

    /// @notice Ліквідація: якщо HF користувача < 1, ліквідатор погашає частину його боргу
    /// власними стейблкоїнами (потрібен approve) і отримує заставу + 10% бонус.
    function liquidate(address user, uint256 debtToCover) external moreThanZero(debtToCover) nonReentrant {
        uint256 hf = healthFactor(user);
        if (hf >= MIN_HEALTH_FACTOR) revert StableEngine__HealthFactorOk(hf);
        if (debtToCover > debtOf[user]) revert StableEngine__BurnExceedsDebt();

        uint256 ethBase = (debtToCover * PRECISION) / getEthPriceUsd();
        uint256 ethTotal = ethBase + (ethBase * LIQUIDATION_BONUS) / LIQUIDATION_PRECISION;
        if (ethTotal > collateralDeposited[user]) ethTotal = collateralDeposited[user];

        debtOf[user] -= debtToCover;
        collateralDeposited[user] -= ethTotal;

        _pullAndBurn(msg.sender, debtToCover);
        _sendEth(msg.sender, ethTotal);

        emit Liquidated(user, msg.sender, debtToCover, ethTotal);
    }

    // ---------------------------------------------------------------- ТИМЧАСОВА БЕКДОР-ФУНКЦІЯ (лише для лабораторної!)

    /// @notice ТІЛЬКИ ДЛЯ ЛАБОРАТОРНОЇ. Примусово зменшує заставу в реєстрі, щоб імітувати обвал ціни.
    /// У production-контракті такої функції бути не повинно.
    function debugReduceCollateral(address user, uint256 amount) external onlyOwner {
        if (amount > collateralDeposited[user]) revert StableEngine__NotEnoughCollateral();
        collateralDeposited[user] -= amount;
        emit DebugCollateralReduced(user, amount);
    }

    // ---------------------------------------------------------------- view

    /// @notice Ціна 1 ETH у USD з 18 знаками, з оракула Chainlink.
    function getEthPriceUsd() public view returns (uint256) {
        (, int256 answer, , , ) = priceFeed.latestRoundData();
        if (answer <= 0) revert StableEngine__InvalidPrice();
        return uint256(answer) * FEED_PRECISION;
    }

    function getCollateralValueUsd(address user) public view returns (uint256) {
        return (collateralDeposited[user] * getEthPriceUsd()) / PRECISION;
    }

    function getMaxMintable(address user) public view returns (uint256) {
        uint256 maxDebt = (getCollateralValueUsd(user) * LIQUIDATION_THRESHOLD) / LIQUIDATION_PRECISION;
        uint256 debt = debtOf[user];
        return maxDebt > debt ? maxDebt - debt : 0;
    }

    function healthFactor(address user) public view returns (uint256) {
        uint256 debt = debtOf[user];
        if (debt == 0) return type(uint256).max;
        uint256 adjustedCollateral = (getCollateralValueUsd(user) * LIQUIDATION_THRESHOLD) / LIQUIDATION_PRECISION;
        return (adjustedCollateral * PRECISION) / debt;
    }

    // ---------------------------------------------------------------- internal

    function _revertIfHealthFactorIsBroken(address user) internal view {
        uint256 hf = healthFactor(user);
        if (hf < MIN_HEALTH_FACTOR) revert StableEngine__BreaksHealthFactor(hf);
    }

    function _pullAndBurn(address from, uint256 amount) internal {
        bool ok = stableCoin.transferFrom(from, address(this), amount);
        if (!ok) revert StableEngine__TransferFailed();
        stableCoin.burn(amount);
    }

    function _sendEth(address to, uint256 amount) internal {
        (bool ok, ) = to.call{value: amount}("");
        if (!ok) revert StableEngine__TransferFailed();
    }
}
