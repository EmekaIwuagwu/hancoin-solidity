const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("HancoinPaymaster", function () {
    let hancoin;
    let paymaster;
    let entryPoint;
    let owner;
    let user1;
    let user2;

    beforeEach(async function () {
        [owner, user1, user2] = await ethers.getSigners();

        // Deploy mock EntryPoint
        const MockEntryPoint = await ethers.getContractFactory("MockEntryPoint");
        entryPoint = await MockEntryPoint.deploy();
        await entryPoint.deployed();

        // Deploy Hancoin
        const Hancoin = await ethers.getContractFactory("Hancoin");
        hancoin = await Hancoin.deploy(ethers.constants.AddressZero);
        await hancoin.deployed();

        // Deploy Paymaster
        const HancoinPaymaster = await ethers.getContractFactory("HancoinPaymaster");
        paymaster = await HancoinPaymaster.deploy(entryPoint.address, hancoin.address);
        await paymaster.deployed();

        // Authorize paymaster in Hancoin
        await hancoin.setAuthorizedPaymaster(paymaster.address, true);

        // Give users some tokens
        await hancoin.transfer(user1.address, ethers.utils.parseEther("10000"));
        await hancoin.transfer(user2.address, ethers.utils.parseEther("10000"));
    });

    describe("Deployment", function () {
        it("Should set correct EntryPoint and Hancoin addresses", async function () {
            expect(await paymaster.entryPoint()).to.equal(entryPoint.address);
            expect(await paymaster.hancoinToken()).to.equal(hancoin.address);
        });

        it("Should have default exchange rate", async function () {
            const exchangeRate = await paymaster.hnxzToEthExchangeRate();
            expect(exchangeRate).to.equal(1000); // 1000 HNXZ = 1 ETH
        });

        it("Should authorize deployer as relayer", async function () {
            const isAuthorized = await paymaster.authorizedRelayers(owner.address);
            expect(isAuthorized).to.be.true;
        });
    });

    describe("Exchange Rate Management", function () {
        it("Should allow owner to set exchange rate", async function () {
            const newRate = 2000; // 2000 HNXZ = 1 ETH
            
            await paymaster.setExchangeRate(newRate);
            
            const exchangeRate = await paymaster.hnxzToEthExchangeRate();
            expect(exchangeRate).to.equal(newRate);
        });

        it("Should emit event when exchange rate is updated", async function () {
            const newRate = 1500;
            
            await expect(paymaster.setExchangeRate(newRate))
                .to.emit(paymaster, "ExchangeRateUpdated")
                .withArgs(1000, newRate);
        });

        it("Should fail if non-owner tries to set exchange rate", async function () {
            await expect(
                paymaster.connect(user1).setExchangeRate(2000)
            ).to.be.revertedWith("Ownable: caller is not the owner");
        });

        it("Should fail if setting zero exchange rate", async function () {
            await expect(
                paymaster.setExchangeRate(0)
            ).to.be.revertedWith("HP: Invalid exchange rate");
        });
    });

    describe("HNXZ Cost Calculation", function () {
        it("Should correctly calculate required HNXZ for ETH cost", async function () {
            const ethCost = ethers.utils.parseEther("0.001"); // 0.001 ETH
            const expectedHnxz = ethers.utils.parseEther("1"); // 1 HNXZ (1000:1 rate)
            
            const requiredHnxz = await paymaster.getRequiredHNXZ(ethCost);
            expect(requiredHnxz).to.equal(expectedHnxz);
        });

        it("Should handle different exchange rates correctly", async function () {
            // Set new exchange rate: 500 HNXZ = 1 ETH
            await paymaster.setExchangeRate(500);
            
            const ethCost = ethers.utils.parseEther("0.002"); // 0.002 ETH
            const expectedHnxz = ethers.utils.parseEther("1"); // 1 HNXZ (500:1 rate)
            
            const requiredHnxz = await paymaster.getRequiredHNXZ(ethCost);
            expect(requiredHnxz).to.equal(expectedHnxz);
        });

        it("Should handle very small amounts", async function () {
            const ethCost = ethers.utils.parseUnits("1", "gwei"); // 1 gwei
            const expectedHnxz = ethers.utils.parseUnits("1000", "gwei"); // 1000 gwei worth of HNXZ
            
            const requiredHnxz = await paymaster.getRequiredHNXZ(ethCost);
            expect(requiredHnxz).to.equal(expectedHnxz);
        });
    });

    describe("Transaction Sponsorship", function () {
        beforeEach(async function () {
            // Deposit ETH to paymaster for sponsoring
            await paymaster.depositToEntryPoint({ value: ethers.utils.parseEther("1") });
            
            // User1 deposits HNXZ for gas
            await hancoin.connect(user1).depositForGas(ethers.utils.parseEther("1000"));
        });

        it("Should check if paymaster can sponsor transaction", async function () {
            const estimatedCost = ethers.utils.parseEther("0.01"); // 0.01 ETH
            
            const canSponsor = await paymaster.canSponsorTransaction(user1.address, estimatedCost);
            expect(canSponsor).to.be.true;
        });

        it("Should fail sponsorship if user has insufficient HNXZ", async function () {
            const largeCost = ethers.utils.parseEther("10"); // 10 ETH (way more than user has HNXZ for)
            
            const canSponsor = await paymaster.canSponsorTransaction(user1.address, largeCost);
            expect(canSponsor).to.be.false;
        });

        it("Should fail sponsorship if paymaster has insufficient ETH", async function () {
            // Withdraw all ETH from paymaster
            const balance = await paymaster.getEntryPointBalance();
            await paymaster.withdrawFromEntryPoint(owner.address, balance);
            
            const estimatedCost = ethers.utils.parseEther("0.01");
            
            const canSponsor = await paymaster.canSponsorAmount(estimatedCost);
            expect(canSponsor).to.be.false;
        });

        it("Should fail if paymaster not authorized in Hancoin", async function () {
            // Deauthorize paymaster
            await hancoin.setAuthorizedPaymaster(paymaster.address, false);
            
            const estimatedCost = ethers.utils.parseEther("0.01");
            
            const canSponsor = await paymaster.canSponsorTransaction(user1.address, estimatedCost);
            expect(canSponsor).to.be.false;
        });
    });

    describe("User Operation Validation", function () {
        let userOp;

        beforeEach(async function () {
            await paymaster.depositToEntryPoint({ value: ethers.utils.parseEther("1") });
            await hancoin.connect(user1).depositForGas(ethers.utils.parseEther("1000"));

            userOp = {
                sender: user1.address,
                nonce: 1,
                initCode: "0x",
                callData: "0x",
                callGasLimit: 100000,
                verificationGasLimit: 200000,
                preVerificationGas: 50000,
                maxFeePerGas: ethers.utils.parseUnits("20", "gwei"),
                maxPriorityFeePerGas: ethers.utils.parseUnits("2", "gwei"),
                paymasterAndData: "0x",
                signature: "0x"
            };
        });

        it("Should validate user operation successfully", async function () {
            const userOpHash = ethers.utils.keccak256("0x1234");
            const maxCost = ethers.utils.parseEther("0.01");

            // This should be called by EntryPoint, so we use owner (which simulates EntryPoint for testing)
            await paymaster.transferOwnership(entryPoint.address);
            
            const result = await paymaster.connect(entryPoint).validatePaymasterUserOp.staticCall(
                userOp, userOpHash, maxCost
            );
            
            expect(result.validationData).to.equal(0); // Success
            expect(result.context).to.not.equal("0x");
        });

        it("Should fail validation if user has insufficient HNXZ", async function () {
            // Withdraw all HNXZ from gas deposit
            const deposit = await hancoin.getGasDeposit(user1.address);
            await hancoin.connect(user1).withdrawGasDeposit(deposit);

            const userOpHash = ethers.utils.keccak256("0x1234");
            const maxCost = ethers.utils.parseEther("0.01");

            await paymaster.transferOwnership(entryPoint.address);
            
            const result = await paymaster.connect(entryPoint).validatePaymasterUserOp.staticCall(
                userOp, userOpHash, maxCost
            );
            
            expect(result.validationData).to.equal(1); // Failed
        });
    });

    describe("ETH Management", function () {
        it("Should allow owner to deposit ETH to EntryPoint", async function () {
            const depositAmount = ethers.utils.parseEther("0.5");
            
            await paymaster.depositToEntryPoint({ value: depositAmount });
            
            const balance = await paymaster.getEntryPointBalance();
            expect(balance).to.equal(depositAmount);
        });

        it("Should emit event when ETH is deposited", async function () {
            const depositAmount = ethers.utils.parseEther("0.5");
            
            await expect(paymaster.depositToEntryPoint({ value: depositAmount }))
                .to.emit(paymaster, "ETHDeposited")
                .withArgs(owner.address, depositAmount);
        });

        it("Should allow owner to withdraw ETH from EntryPoint", async function () {
            const depositAmount = ethers.utils.parseEther("1");
            const withdrawAmount = ethers.utils.parseEther("0.5");
            
            await paymaster.depositToEntryPoint({ value: depositAmount });
            
            await expect(paymaster.withdrawFromEntryPoint(owner.address, withdrawAmount))
                .to.emit(paymaster, "ETHWithdrawn")
                .withArgs(owner.address, withdrawAmount);
            
            const balance = await paymaster.getEntryPointBalance();
            expect(balance).to.equal(depositAmount.sub(withdrawAmount));
        });

        it("Should fail if non-owner tries to manage ETH", async function () {
            await expect(
                paymaster.connect(user1).depositToEntryPoint({ value: ethers.utils.parseEther("0.1") })
            ).to.be.revertedWith("Ownable: caller is not the owner");
            
            await expect(
                paymaster.connect(user1).withdrawFromEntryPoint(user1.address, ethers.utils.parseEther("0.1"))
            ).to.be.revertedWith("Ownable: caller is not the owner");
        });

        it("Should accept ETH through receive function", async function () {
            const sendAmount = ethers.utils.parseEther("0.1");
            
            await expect(
                owner.sendTransaction({
                    to: paymaster.address,
                    value: sendAmount
                })
            ).to.emit(paymaster, "ETHDeposited")
            .withArgs(owner.address, sendAmount);
        });
    });

    describe("Gas Overhead Configuration", function () {
        it("Should allow owner to set gas overhead", async function () {
            const newOverhead = 50000;
            
            await paymaster.setGasOverhead(newOverhead);
            
            const gasOverhead = await paymaster.gasOverhead();
            expect(gasOverhead).to.equal(newOverhead);
        });

        it("Should fail if setting gas overhead too high", async function () {
            const tooHighOverhead = 150000;
            
            await expect(
                paymaster.setGasOverhead(tooHighOverhead)
            ).to.be.revertedWith("HP: Overhead too high");
        });

        it("Should fail if non-owner tries to set gas overhead", async function () {
            await expect(
                paymaster.connect(user1).setGasOverhead(40000)
            ).to.be.revertedWith("Ownable: caller is not the owner");
        });
    });

    describe("Relayer Authorization", function () {
        it("Should allow owner to authorize relayers", async function () {
            await expect(paymaster.setAuthorizedRelayer(user1.address, true))
                .to.emit(paymaster, "RelayerAuthorized")
                .withArgs(user1.address, true);
            
            const isAuthorized = await paymaster.authorizedRelayers(user1.address);
            expect(isAuthorized).to.be.true;
        });

        it("Should allow owner to deauthorize relayers", async function () {
            await paymaster.setAuthorizedRelayer(user1.address, true);
            await paymaster.setAuthorizedRelayer(user1.address, false);
            
            const isAuthorized = await paymaster.authorizedRelayers(user1.address);
            expect(isAuthorized).to.be.false;
        });

        it("Should fail if non-owner tries to authorize relayers", async function () {
            await expect(
                paymaster.connect(user1).setAuthorizedRelayer(user2.address, true)
            ).to.be.revertedWith("Ownable: caller is not the owner");
        });
    });

    describe("User Operation Estimation", function () {
        it("Should estimate gas cost for user operation", async function () {
            const userOp = {
                sender: user1.address,
                nonce: 1,
                initCode: "0x",
                callData: "0x",
                callGasLimit: 100000,
                verificationGasLimit: 200000,
                preVerificationGas: 50000,
                maxFeePerGas: ethers.utils.parseUnits("20", "gwei"),
                maxPriorityFeePerGas: ethers.utils.parseUnits("2", "gwei"),
                paymasterAndData: "0x",
                signature: "0x"
            };
            
            const estimatedCost = await paymaster.getEstimatedGasCost(userOp);
            
            // Should be (100000 + 200000 + 50000 + 34000) * 20 gwei
            const expectedCost = ethers.BigNumber.from(384000).mul(ethers.utils.parseUnits("20", "gwei"));
            expect(estimatedCost).to.equal(expectedCost);
        });

        it("Should handle different gas prices", async function () {
            const userOp = {
                sender: user1.address,
                nonce: 1,
                initCode: "0x",
                callData: "0x",
                callGasLimit: 100000,
                verificationGasLimit: 100000,
                preVerificationGas: 21000,
                maxFeePerGas: ethers.utils.parseUnits("50", "gwei"),
                maxPriorityFeePerGas: ethers.utils.parseUnits("5", "gwei"),
                paymasterAndData: "0x",
                signature: "0x"
            };
            
            const estimatedCost = await paymaster.getEstimatedGasCost(userOp);
            
            // Should be (100000 + 100000 + 21000 + 34000) * 50 gwei
            const expectedCost = ethers.BigNumber.from(255000).mul(ethers.utils.parseUnits("50", "gwei"));
            expect(estimatedCost).to.equal(expectedCost);
        });
    });

    describe("Pause Functionality", function () {
        it("Should allow owner to pause and unpause", async function () {
            await paymaster.pause();
            expect(await paymaster.paused()).to.be.true;
            
            await paymaster.unpause();
            expect(await paymaster.paused()).to.be.false;
        });

        it("Should fail if non-owner tries to pause", async function () {
            await expect(
                paymaster.connect(user1).pause()
            ).to.be.revertedWith("Ownable: caller is not the owner");
        });
    });

    describe("View Functions", function () {
        beforeEach(async function () {
            await paymaster.depositToEntryPoint({ value: ethers.utils.parseEther("1") });
        });

        it("Should return correct EntryPoint balance", async function () {
            const balance = await paymaster.getEntryPointBalance();
            expect(balance).to.equal(ethers.utils.parseEther("1"));
        });

        it("Should track user gas spent", async function () {
            const initialSpent = await paymaster.getUserGasSpent(user1.address);
            expect(initialSpent).to.equal(0);
        });

        it("Should check if paymaster can sponsor specific amount", async function () {
            const amount = ethers.utils.parseEther("0.5");
            const canSponsor = await paymaster.canSponsorAmount(amount);
            expect(canSponsor).to.be.true;
            
            const tooMuch = ethers.utils.parseEther("2");
            const cannotSponsor = await paymaster.canSponsorAmount(tooMuch);
            expect(cannotSponsor).to.be.false;
        });
    });

    describe("Edge Cases", function () {
        it("Should handle zero amounts gracefully", async function () {
            const zeroAmount = await paymaster.getRequiredHNXZ(0);
            expect(zeroAmount).to.equal(0);
        });

        it("Should handle very large amounts", async function () {
            const largeEthAmount = ethers.utils.parseEther("1000");
            const requiredHnxz = await paymaster.getRequiredHNXZ(largeEthAmount);
            const expectedHnxz = ethers.utils.parseEther("1000000"); // 1M HNXZ
            expect(requiredHnxz).to.equal(expectedHnxz);
        });

        it("Should maintain precision for small amounts", async function () {
            // Set a high exchange rate for precision testing
            await paymaster.setExchangeRate(1000000); // 1M HNXZ = 1 ETH
            
            const smallEthAmount = ethers.utils.parseUnits("1", "gwei");
            const requiredHnxz = await paymaster.getRequiredHNXZ(smallEthAmount);
            const expectedHnxz = ethers.utils.parseUnits("1000000", "gwei");
            expect(requiredHnxz).to.equal(expectedHnxz);
        });
    });
});