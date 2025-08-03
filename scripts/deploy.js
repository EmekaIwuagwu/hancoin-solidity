const hre = require("hardhat");
const { ethers } = hre;
const fs = require("fs");
const path = require("path");

// Known ERC-4337 EntryPoint addresses
const ENTRY_POINT_ADDRESSES = {
    mainnet: "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",
    sepolia: "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",
    polygon: "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",
    localhost: null, // Will deploy mock
    hardhat: null
};

async function main() {
    console.log("🚀 Starting Hancoin Gas Abstraction Deployment...\n");

    // Get network information
    const network = await ethers.provider.getNetwork();
    const networkName = network.name === "unknown" ? "localhost" : network.name;
    
    console.log("🌐 Network:", networkName);
    console.log("🆔 Chain ID:", network.chainId);

    // Get deployer account
    const [deployer] = await ethers.getSigners();
    const deployerAddress = await deployer.getAddress();
    const balance = await ethers.provider.getBalance(deployerAddress);
    
    console.log("📝 Deployer:", deployerAddress);
    console.log("💰 Balance:", ethers.formatEther(balance), "ETH\n");

    const deploymentInfo = {
        network: networkName,
        chainId: network.chainId.toString(),
        deployer: deployerAddress,
        timestamp: new Date().toISOString(),
        contracts: {}
    };

    // ============ STEP 1: GET OR DEPLOY ENTRYPOINT ============

    let entryPointAddress = ENTRY_POINT_ADDRESSES[networkName];

    if (!entryPointAddress) {
        console.log("📦 EntryPoint not found for this network. Deploying mock EntryPoint...");

        const MockEntryPoint = await ethers.getContractFactory("MockEntryPoint");
        const entryPoint = await MockEntryPoint.deploy();
        await entryPoint.waitForDeployment();

        entryPointAddress = await entryPoint.getAddress();
        deploymentInfo.contracts.entryPoint = {
            address: entryPointAddress,
            transactionHash: entryPoint.deploymentTransaction()?.hash,
            type: "mock"
        };

        console.log("✅ Mock EntryPoint deployed to:", entryPointAddress);
    } else {
        console.log("🎯 Using existing EntryPoint at:", entryPointAddress);
        deploymentInfo.contracts.entryPoint = {
            address: entryPointAddress,
            type: "official"
        };
    }

    // ============ STEP 2: DEPLOY HANCOIN ============

    console.log("\n🪙 Deploying Hancoin...");

    const Hancoin = await ethers.getContractFactory("Hancoin");
    const hancoin = await Hancoin.deploy();
    await hancoin.waitForDeployment();

    const hancoinAddress = await hancoin.getAddress();
    deploymentInfo.contracts.hancoin = {
        address: hancoinAddress,
        transactionHash: hancoin.deploymentTransaction()?.hash,
        name: "Hancoin",
        symbol: "HNXZ",
        totalSupply: "1000000000",
        decimals: 18
    };

    console.log("✅ Hancoin deployed to:", hancoinAddress);
    console.log("📊 Total Supply:", ethers.formatEther(await hancoin.totalSupply()), "HNXZ");

    // ============ STEP 3: DEPLOY PAYMASTER ============

    console.log("\n💰 Deploying HancoinPaymaster...");

    const HancoinPaymaster = await ethers.getContractFactory("HancoinPaymaster");
    const paymaster = await HancoinPaymaster.deploy(entryPointAddress, hancoinAddress);
    await paymaster.waitForDeployment();

    const paymasterAddress = await paymaster.getAddress();
    deploymentInfo.contracts.paymaster = {
        address: paymasterAddress,
        transactionHash: paymaster.deploymentTransaction()?.hash,
        entryPoint: entryPointAddress,
        hancoinToken: hancoinAddress
    };

    console.log("✅ HancoinPaymaster deployed to:", paymasterAddress);

    // ============ STEP 4: SETUP INTEGRATION ============

    console.log("\n🔗 Setting up contract integration...");

    const authTx = await hancoin.setAuthorizedPaymaster(paymasterAddress, true);
    await authTx.wait();
    console.log("✅ Paymaster authorized in Hancoin");

    // ============ STEP 5: CONFIGURE PAYMASTER ============

    console.log("\n⚙️ Configuring paymaster...");

    const exchangeRate = process.env.INITIAL_EXCHANGE_RATE || "1000";
    const setRateTx = await paymaster.setExchangeRate(exchangeRate);
    await setRateTx.wait();
    console.log(`📈 Exchange rate set to: ${exchangeRate} HNXZ = 1 ETH`);

    const depositAmount = ethers.parseEther(process.env.PAYMASTER_INITIAL_DEPOSIT || "1.0");

    if (balance > (depositAmount * 2n)) {
        console.log(`💰 Depositing ${ethers.formatEther(depositAmount)} ETH to paymaster...`);
        const depositTx = await paymaster.depositToEntryPoint({ value: depositAmount });
        await depositTx.wait();
        console.log("✅ ETH deposited to paymaster");

        deploymentInfo.contracts.paymaster.initialDeposit = ethers.formatEther(depositAmount);
    } else {
        console.log("⚠️  Skipping ETH deposit due to low balance");
    }

    // ============ STEP 6: SETUP COLLATERAL AND LOAN PARAMS ============

    console.log("\n🏦 Setting up loan system...");

    // Approve HNXZ as collateral for testing
    const approveCollateralTx = await hancoin.setApprovedCollateralToken(hancoinAddress, true);
    await approveCollateralTx.wait();
    console.log("✅ HNXZ approved as collateral token");

    // Set loan parameters
    const loanParamsTx = await hancoin.setLoanParameters(
        500,                    // 5% annual interest
        365 * 24 * 60 * 60,    // 1 year duration
        7500                   // 75% LTV ratio
    );
    await loanParamsTx.wait();
    console.log("✅ Loan parameters configured");

    // ============ STEP 7: SAVE DEPLOYMENT INFO ============

    const deploymentPath = path.join(__dirname, "..", "deployment.json");
    fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));

    // Generate frontend config
    const frontendConfig = {
        contracts: {
            hancoin: hancoinAddress,
            paymaster: paymasterAddress,
            entryPoint: entryPointAddress
        },
        network: {
            name: networkName,
            chainId: network.chainId.toString()
        },
        exchangeRate: {
            hnxzPerEth: parseInt(exchangeRate),
            description: `${exchangeRate} HNXZ = 1 ETH`
        }
    };

    const configContent = `// Auto-generated contract configuration
export const HANCOIN_CONFIG = ${JSON.stringify(frontendConfig, null, 2)};

export const HANCOIN_ABI = [
    "function depositForGas(uint256 amount) external",
    "function withdrawGasDeposit(uint256 amount) external", 
    "function getGasDeposit(address user) external view returns (uint256)",
    "function balanceOf(address account) external view returns (uint256)",
    "function transfer(address to, uint256 amount) external returns (bool)",
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function createEscrow(address recipient, uint256 amount) external",
    "function releaseEscrow(uint256 escrowId) external",
    "function requestLoan(address collateralToken, uint256 collateralAmount, uint256 loanAmount) external",
    "function repayLoan(uint256 loanId) external"
];

export const PAYMASTER_ABI = [
    "function canSponsorTransaction(address user, uint256 estimatedCost) external view returns (bool)",
    "function getRequiredHNXZ(uint256 ethCost) external view returns (uint256)",
    "function getEntryPointBalance() external view returns (uint256)"
];
`;

    const frontendDir = path.join(__dirname, "..", "frontend", "src");
    if (!fs.existsSync(frontendDir)) {
        fs.mkdirSync(frontendDir, { recursive: true });
    }
    fs.writeFileSync(path.join(frontendDir, "config.js"), configContent);

    // ============ FINAL SUMMARY ============

    console.log("\n🎉 Deployment Complete!");
    console.log("========================");
    console.log("🪙 Hancoin (HNXZ):", hancoinAddress);
    console.log("💰 HancoinPaymaster:", paymasterAddress);
    console.log("🎯 EntryPoint:", entryPointAddress);
    console.log("🌐 Network:", networkName);
    console.log("📈 Exchange Rate:", exchangeRate, "HNXZ = 1 ETH");

    console.log("\n📋 Next Steps:");
    console.log("==============");
    console.log("1. Run setup script:", `npm run setup`);
    console.log("2. Test gas abstraction:", "npm run test-gas-abstraction");
    if (networkName !== "localhost" && networkName !== "hardhat") {
        console.log("3. Verify contracts:", `npm run verify`);
    }

    console.log("\n💡 Gas Abstraction is now ready!");
    console.log("Users can deposit HNXZ tokens and pay gas fees with them! 🎯");

    return deploymentInfo;
}

if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error("❌ Deployment failed:", error);
            process.exit(1);
        });
}

module.exports = { main };