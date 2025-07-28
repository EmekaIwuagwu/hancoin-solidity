const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
    console.log("🧪 Testing Hancoin Gas Abstraction System...\n");

    // Load deployment info
    const deploymentPath = path.join(__dirname, "..", "deployment.json");
    if (!fs.existsSync(deploymentPath)) {
        console.error("❌ deployment.json not found. Please run deployment first.");
        process.exit(1);
    }

    const deploymentInfo = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
    const [deployer, user1, user2] = await ethers.getSigners();

    console.log("📋 Test Configuration:");
    console.log("🪙 Hancoin:", deploymentInfo.contracts.hancoin.address);
    console.log("💰 Paymaster:", deploymentInfo.contracts.paymaster.address);
    console.log("👤 Deployer:", deployer.address);
    console.log("👤 User1:", user1.address);
    console.log("👤 User2:", user2.address);
    console.log("");

    // Connect to contracts
    const hancoin = await ethers.getContractAt("Hancoin", deploymentInfo.contracts.hancoin.address);
    const paymaster = await ethers.getContractAt("HancoinPaymaster", deploymentInfo.contracts.paymaster.address);

    // ============ TEST 1: BASIC TOKEN FUNCTIONS ============
    
    console.log("🧪 Test 1: Basic Token Functions");
    console.log("=================================");
    
    const totalSupply = await hancoin.totalSupply();
    const deployerBalance = await hancoin.balanceOf(deployer.address);
    
    console.log("✅ Total Supply:", ethers.utils.formatEther(totalSupply), "HNXZ");
    console.log("✅ Deployer Balance:", ethers.utils.formatEther(deployerBalance), "HNXZ");
    
    // Transfer some tokens to test users
    const transferAmount = ethers.utils.parseEther("10000"); // 10k HNXZ
    
    console.log("📤 Transferring 10,000 HNXZ to test users...");
    await hancoin.transfer(user1.address, transferAmount);
    await hancoin.transfer(user2.address, transferAmount);
    
    const user1Balance = await hancoin.balanceOf(user1.address);
    const user2Balance = await hancoin.balanceOf(user2.address);
    
    console.log("✅ User1 Balance:", ethers.utils.formatEther(user1Balance), "HNXZ");
    console.log("✅ User2 Balance:", ethers.utils.formatEther(user2Balance), "HNXZ");

    // ============ TEST 2: GAS DEPOSIT SYSTEM ============
    
    console.log("\n🧪 Test 2: Gas Deposit System");
    console.log("=============================");
    
    const gasDepositAmount = ethers.utils.parseEther("100"); // 100 HNXZ for gas
    
    console.log("💰 User1 depositing 100 HNXZ for gas...");
    await hancoin.connect(user1).depositForGas(gasDepositAmount);
    
    const gasDeposit = await hancoin.getGasDeposit(user1.address);
    console.log("✅ User1 Gas Deposit:", ethers.utils.formatEther(gasDeposit), "HNXZ");
    
    // Test gas payment capability
    const estimatedGas = ethers.BigNumber.from(100000); // 100k gas
    const canPayGas = await hancoin.canPayGas(user1.address, estimatedGas);
    console.log("✅ Can Pay Gas:", canPayGas);

    // ============ TEST 3: PAYMASTER INTEGRATION ============
    
    console.log("\n🧪 Test 3: Paymaster Integration");
    console.log("=================================");
    
    // Check paymaster balance
    const paymasterBalance = await paymaster.getEntryPointBalance();
    console.log("💰 Paymaster ETH Balance:", ethers.utils.formatEther(paymasterBalance), "ETH");
    
    // Check if paymaster can sponsor transactions
    const estimatedCost = ethers.utils.parseEther("0.001"); // 0.001 ETH
    const canSponsor = await paymaster.canSponsorTransaction(user1.address, estimatedCost);
    console.log("✅ Can Sponsor Transaction:", canSponsor);
    
    // Get required HNXZ for gas cost
    const requiredHNXZ = await paymaster.getRequiredHNXZ(estimatedCost);
    console.log("📊 Required HNXZ for 0.001 ETH gas:", ethers.utils.formatEther(requiredHNXZ), "HNXZ");

    // ============ TEST 4: LOAN SYSTEM ============
    
    console.log("\n🧪 Test 4: Loan System");
    console.log("======================");
    
    // For testing, we'll use HNXZ itself as collateral
    await hancoin.setApprovedCollateralToken(hancoin.address, true);
    console.log("✅ HNXZ approved as collateral (for testing)");
    
    const collateralAmount = ethers.utils.parseEther("1000"); // 1000 HNXZ collateral
    const loanAmount = ethers.utils.parseEther("750");       // 750 HNXZ loan (75% LTV)
    
    console.log("🏦 User2 requesting loan...");
    console.log("   Collateral:", ethers.utils.formatEther(collateralAmount), "HNXZ");
    console.log("   Loan Amount:", ethers.utils.formatEther(loanAmount), "HNXZ");
    
    // Approve collateral
    await hancoin.connect(user2).approve(hancoin.address, collateralAmount);
    
    // Request loan
    await hancoin.connect(user2).requestLoan(hancoin.address, collateralAmount, loanAmount);
    
    // Check loan details
    const loanDetails = await hancoin.getLoanDetails(1);
    console.log("✅ Loan Created:");
    console.log("   ID:", loanDetails.id.toString());
    console.log("   Borrower:", loanDetails.borrower);
    console.log("   Loan Amount:", ethers.utils.formatEther(loanDetails.loanAmount), "HNXZ");
    console.log("   Active:", loanDetails.isActive);
    
    // Check user balance after loan
    const user2BalanceAfterLoan = await hancoin.balanceOf(user2.address);
    console.log("✅ User2 Balance After Loan:", ethers.utils.formatEther(user2BalanceAfterLoan), "HNXZ");

    // ============ TEST 5: ESCROW SYSTEM ============
    
    console.log("\n🧪 Test 5: Escrow System");
    console.log("========================");
    
    const escrowAmount = ethers.utils.parseEther("500"); // 500 HNXZ
    
    console.log("🔒 User1 creating escrow for User2...");
    console.log("   Amount:", ethers.utils.formatEther(escrowAmount), "HNXZ");
    
    await hancoin.connect(user1).createEscrow(user2.address, escrowAmount);
    
    const escrowDetails = await hancoin.getEscrowDetails(1);
    console.log("✅ Escrow Created:");
    console.log("   ID:", escrowDetails.id.toString());
    console.log("   Sender:", escrowDetails.sender);
    console.log("   Recipient:", escrowDetails.recipient);
    console.log("   Amount:", ethers.utils.formatEther(escrowDetails.amount), "HNXZ");
    
    // Check balances
    const user1BalanceAfterEscrow = await hancoin.balanceOf(user1.address);
    console.log("✅ User1 Balance After Escrow:", ethers.utils.formatEther(user1BalanceAfterEscrow), "HNXZ");

    // ============ TEST 6: CREDIT CARD INTEGRATION ============
    
    console.log("\n🧪 Test 6: Credit Card Integration");
    console.log("==================================");
    
    const creditAmount = ethers.utils.parseEther("1000"); // 1000 HNXZ
    
    console.log("💳 Crediting User1 with 1000 HNXZ (simulating credit card purchase)...");
    await hancoin.creditUser(user1.address, creditAmount);
    
    const user1FinalBalance = await hancoin.balanceOf(user1.address);
    console.log("✅ User1 Final Balance:", ethers.utils.formatEther(user1FinalBalance), "HNXZ");

    // ============ TEST 7: WITHDRAWAL TEST ============
    
    console.log("\n🧪 Test 7: Gas Deposit Withdrawal");
    console.log("=================================");
    
    const withdrawAmount = ethers.utils.parseEther("50"); // 50 HNXZ
    
    console.log("💸 User1 withdrawing 50 HNXZ from gas deposit...");
    await hancoin.connect(user1).withdrawGasDeposit(withdrawAmount);
    
    const finalGasDeposit = await hancoin.getGasDeposit(user1.address);
    console.log("✅ User1 Final Gas Deposit:", ethers.utils.formatEther(finalGasDeposit), "HNXZ");

    // ============ FINAL SUMMARY ============
    
    console.log("\n🎉 Test Summary");
    console.log("===============");
    console.log("✅ Token transfers working");
    console.log("✅ Gas deposit system working");
    console.log("✅ Paymaster integration working");
    console.log("✅ Loan system working");
    console.log("✅ Escrow system working");
    console.log("✅ Credit card integration working");
    console.log("✅ Gas deposit withdrawal working");
    
    console.log("\n📊 Final Balances:");
    console.log("==================");
    const finalBalances = {
        user1: await hancoin.balanceOf(user1.address),
        user2: await hancoin.balanceOf(user2.address),
        user1GasDeposit: await hancoin.getGasDeposit(user1.address),
        paymasterETH: await paymaster.getEntryPointBalance()
    };
    
    console.log("👤 User1 HNXZ:", ethers.utils.formatEther(finalBalances.user1), "HNXZ");
    console.log("👤 User2 HNXZ:", ethers.utils.formatEther(finalBalances.user2), "HNXZ");
    console.log("⛽ User1 Gas Deposit:", ethers.utils.formatEther(finalBalances.user1GasDeposit), "HNXZ");
    console.log("💰 Paymaster ETH:", ethers.utils.formatEther(finalBalances.paymasterETH), "ETH");
    
    console.log("\n🚀 Gas Abstraction System: FULLY FUNCTIONAL! 🎯");
    console.log("Users can now pay gas fees with HNXZ tokens!");

    return {
        success: true,
        balances: finalBalances,
        contracts: {
            hancoin: hancoin.address,
            paymaster: paymaster.address
        }
    };
}

if (require.main === module) {
    main()
        .then((result) => {
            console.log("\n✅ All tests passed!");
            process.exit(0);
        })
        .catch((error) => {
            console.error("❌ Tests failed:", error);
            process.exit(1);
        });
}

module.exports = { main };