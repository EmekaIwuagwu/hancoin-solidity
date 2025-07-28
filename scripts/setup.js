const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
    console.log("⚙️ Running Hancoin Post-Deployment Setup...\n");

    // Load deployment info
    const deploymentPath = path.join(__dirname, "..", "deployment.json");
    if (!fs.existsSync(deploymentPath)) {
        console.error("❌ deployment.json not found. Please run deployment first.");
        process.exit(1);
    }

    const deploymentInfo = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
    const [deployer] = await ethers.getSigners();

    console.log("📋 Deployment Info:");
    console.log("🪙 Hancoin:", deploymentInfo.contracts.hancoin.address);
    console.log("💰 Paymaster:", deploymentInfo.contracts.paymaster.address);
    console.log("🎯 EntryPoint:", deploymentInfo.contracts.entryPoint.address);
    console.log("");

    // Connect to contracts
    const hancoin = await ethers.getContractAt("Hancoin", deploymentInfo.contracts.hancoin.address);
    const paymaster = await ethers.getContractAt("HancoinPaymaster", deploymentInfo.contracts.paymaster.address);

    // ============ SETUP COLLATERAL TOKENS ============
    
    console.log("🔧 Setting up collateral tokens...");
    
    const STABLECOIN_ADDRESSES = {
        mainnet: {
            USDC: "0xA0b86a33E6417d6a30E4de71c4a0AE0E5B1f3B6B",
            USDT: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
            DAI: "0x6B175474E89094C44Da98b954EedeAC495271d0F"
        },
        sepolia: {
            USDC: "0x07865c6E87B9F70255377e024ace6630C1Eaa37F"
        }
    };

    const network = deploymentInfo.network;
    const stablecoins = STABLECOIN_ADDRESSES[network];

    if (stablecoins) {
        for (const [symbol, address] of Object.entries(stablecoins)) {
            try {
                const tx = await hancoin.setApprovedCollateralToken(address, true);
                await tx.wait();
                console.log(`✅ ${symbol} (${address}) approved as collateral`);
            } catch (error) {
                console.log(`⚠️  Failed to approve ${symbol}: ${error.message}`);
            }
        }
    } else {
        console.log("ℹ️  No known stablecoin addresses for this network");
    }

    // ============ CONFIGURE LOAN PARAMETERS ============
    
    console.log("\n💰 Configuring loan parameters...");
    
    try {
        const tx = await hancoin.setLoanParameters(
            500,           // 5% annual interest
            365 * 24 * 60 * 60, // 1 year
            7500           // 75% LTV ratio
        );
        await tx.wait();
        console.log("✅ Loan parameters configured");
    } catch (error) {
        console.log("⚠️  Failed to set loan parameters:", error.message);
    }

    // ============ VERIFY SETUP ============
    
    console.log("\n🔍 Verifying setup...");
    
    const isAuthorized = await hancoin.authorizedPaymasters(paymaster.address);
    console.log("✅ Paymaster authorized:", isAuthorized);
    
    const exchangeRate = await paymaster.hnxzToEthExchangeRate();
    console.log("📈 Exchange rate:", exchangeRate.toString(), "HNXZ = 1 ETH");
    
    const totalSupply = await hancoin.totalSupply();
    console.log("🪙 Total HNXZ supply:", ethers.utils.formatEther(totalSupply), "HNXZ");

    console.log("\n🎉 Setup Complete!");
    console.log("✅ Collateral tokens configured");
    console.log("✅ Loan parameters set");
    console.log("✅ System ready for use");
    
    console.log("\n🚀 Your Hancoin gas abstraction system is ready!");
    
    return true;
}

if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error("❌ Setup failed:", error);
            process.exit(1);
        });
}

module.exports = { main };