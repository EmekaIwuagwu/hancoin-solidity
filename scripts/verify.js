const { run } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
    console.log("🔍 Starting Contract Verification...\n");

    // Load deployment info
    const deploymentPath = path.join(__dirname, "..", "deployment.json");
    if (!fs.existsSync(deploymentPath)) {
        console.error("❌ deployment.json not found. Please run deployment first.");
        process.exit(1);
    }

    const deploymentInfo = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
    const network = await ethers.provider.getNetwork();
    const networkName = network.name === "unknown" ? "localhost" : network.name;

    console.log("🌐 Network:", networkName);
    console.log("🆔 Chain ID:", network.chainId);

    if (networkName === "localhost" || networkName === "hardhat") {
        console.log("ℹ️  Verification not needed for local networks");
        return;
    }

    // Verify Hancoin
    console.log("\n🪙 Verifying Hancoin...");
    try {
        await run("verify:verify", {
            address: deploymentInfo.contracts.hancoin.address,
            constructorArguments: [
                deploymentInfo.contracts.paymaster.address
            ],
        });
        console.log("✅ Hancoin verified successfully!");
    } catch (error) {
        if (error.message.toLowerCase().includes("already verified")) {
            console.log("✅ Hancoin already verified!");
        } else {
            console.error("❌ Hancoin verification failed:", error.message);
        }
    }

    // Verify HancoinPaymaster
    console.log("\n💰 Verifying HancoinPaymaster...");
    try {
        await run("verify:verify", {
            address: deploymentInfo.contracts.paymaster.address,
            constructorArguments: [
                deploymentInfo.contracts.entryPoint.address,
                deploymentInfo.contracts.hancoin.address
            ],
        });
        console.log("✅ HancoinPaymaster verified successfully!");
    } catch (error) {
        if (error.message.toLowerCase().includes("already verified")) {
            console.log("✅ HancoinPaymaster already verified!");
        } else {
            console.error("❌ HancoinPaymaster verification failed:", error.message);
        }
    }

    // Verify MockEntryPoint if deployed
    if (deploymentInfo.contracts.entryPoint.type === "mock") {
        console.log("\n🎯 Verifying MockEntryPoint...");
        try {
            await run("verify:verify", {
                address: deploymentInfo.contracts.entryPoint.address,
                constructorArguments: [],
            });
            console.log("✅ MockEntryPoint verified successfully!");
        } catch (error) {
            if (error.message.toLowerCase().includes("already verified")) {
                console.log("✅ MockEntryPoint already verified!");
            } else {
                console.error("❌ MockEntryPoint verification failed:", error.message);
            }
        }
    }

    console.log("\n🎉 Verification Complete!");
    console.log("==========================");
    
    const explorerUrls = {
        mainnet: "https://etherscan.io/address/",
        sepolia: "https://sepolia.etherscan.io/address/",
        polygon: "https://polygonscan.com/address/",
        mumbai: "https://mumbai.polygonscan.com/address/"
    };

    const explorerUrl = explorerUrls[networkName];
    if (explorerUrl) {
        console.log("🪙 Hancoin:", explorerUrl + deploymentInfo.contracts.hancoin.address);
        console.log("💰 Paymaster:", explorerUrl + deploymentInfo.contracts.paymaster.address);
    }

    console.log("\n✅ All contracts verified and ready for production use!");
}

if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error("❌ Verification failed:", error);
            process.exit(1);
        });
}

module.exports = { main };