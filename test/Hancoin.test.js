const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Hancoin", function () {
    let hancoin;
    let owner;
    let user1;
    let user2;
    let paymaster;

    beforeEach(async function () {
        [owner, user1, user2, paymaster] = await ethers.getSigners();

        // Deploy Hancoin
        const Hancoin = await ethers.getContractFactory("Hancoin");
        hancoin = await Hancoin.deploy(ethers.constants.AddressZero);
        await hancoin.deployed();

        // Authorize paymaster
        await hancoin.setAuthorizedPaymaster(paymaster.address, true);
    });

    describe("Deployment", function () {
        it("Should have correct name and symbol", async function () {
            expect(await hancoin.name()).to.equal("Hancoin");
            expect(await hancoin.symbol()).to.equal("HNXZ");
        });

        it("Should have correct total supply", async function () {
            const totalSupply = await hancoin.totalSupply();
            expect(totalSupply).to.equal(ethers.utils.parseEther("1000000000")); // 1B tokens
        });

        it("Should mint initial supply to deployer", async function () {
            const ownerBalance = await hancoin.balanceOf(owner.address);
            const totalSupply = await hancoin.totalSupply();
            expect(ownerBalance).to.equal(totalSupply);
        });

        it("Should have 18 decimals", async function () {
            expect(await hancoin.decimals()).to.equal(18);
        });
    });

    describe("Gas Deposits", function () {
        beforeEach(async function () {
            // Give user1 some tokens
            await hancoin.transfer(user1.address, ethers.utils.parseEther("1000"));
        });

        it("Should allow users to deposit for gas", async function () {
            const depositAmount = ethers.utils.parseEther("100");
            
            await hancoin.connect(user1).depositForGas(depositAmount);
            
            const gasDeposit = await hancoin.getGasDeposit(user1.address);
            expect(gasDeposit).to.equal(depositAmount);
        });

        it("Should emit GasDepositMade event", async function () {
            const depositAmount = ethers.utils.parseEther("100");
            
            await expect(hancoin.connect(user1).depositForGas(depositAmount))
                .to.emit(hancoin, "GasDepositMade")
                .withArgs(user1.address, depositAmount);
        });

        it("Should allow users to withdraw gas deposits", async function () {
            const depositAmount = ethers.utils.parseEther("100");
            const withdrawAmount = ethers.utils.parseEther("50");
            
            await hancoin.connect(user1).depositForGas(depositAmount);
            await hancoin.connect(user1).withdrawGasDeposit(withdrawAmount);
            
            const gasDeposit = await hancoin.getGasDeposit(user1.address);
            expect(gasDeposit).to.equal(depositAmount.sub(withdrawAmount));
        });

        it("Should fail if insufficient balance for gas deposit", async function () {
            const depositAmount = ethers.utils.parseEther("2000"); // More than user has
            
            await expect(
                hancoin.connect(user1).depositForGas(depositAmount)
            ).to.be.revertedWith("HNXZ: Insufficient balance");
        });

        it("Should fail if withdrawing more than deposited", async function () {
            const depositAmount = ethers.utils.parseEther("50");
            const withdrawAmount = ethers.utils.parseEther("100");
            
            await hancoin.connect(user1).depositForGas(depositAmount);
            
            await expect(
                hancoin.connect(user1).withdrawGasDeposit(withdrawAmount)
            ).to.be.revertedWith("HNXZ: Insufficient gas deposit");
        });

        it("Should check if user can pay gas", async function () {
            const depositAmount = ethers.utils.parseEther("100");
            const gasAmount = ethers.BigNumber.from(100000);
            
            await hancoin.connect(user1).depositForGas(depositAmount);
            
            const canPay = await hancoin.canPayGas(user1.address, gasAmount);
            expect(canPay).to.be.true;
        });

        it("Should calculate required HNXZ for gas", async function () {
            const gasAmount = ethers.BigNumber.from(100000);
            const gasPrice = await hancoin.gasPrice();
            const expectedHNXZ = gasAmount.mul(gasPrice);
            
            const requiredHNXZ = await hancoin.getRequiredHNXZForGas(gasAmount);
            expect(requiredHNXZ).to.equal(expectedHNXZ);
        });
    });

    describe("Paymaster Integration", function () {
        beforeEach(async function () {
            await hancoin.transfer(user1.address, ethers.utils.parseEther("1000"));
            await hancoin.connect(user1).depositForGas(ethers.utils.parseEther("100"));
        });

        it("Should allow authorized paymaster to charge gas", async function () {
            const gasUsed = ethers.BigNumber.from(50000);
            const initialDeposit = await hancoin.getGasDeposit(user1.address);
            
            await hancoin.connect(paymaster).payGasInHNXZ(user1.address, gasUsed);
            
            const finalDeposit = await hancoin.getGasDeposit(user1.address);
            const gasPrice = await hancoin.gasPrice();
            const expectedCharge = gasUsed.mul(gasPrice);
            
            expect(finalDeposit).to.equal(initialDeposit.sub(expectedCharge));
        });

        it("Should fail if unauthorized paymaster tries to charge", async function () {
            const gasUsed = ethers.BigNumber.from(50000);
            
            await expect(
                hancoin.connect(user2).payGasInHNXZ(user1.address, gasUsed)
            ).to.be.revertedWith("HNXZ: Not authorized paymaster");
        });

        it("Should emit GasUsed event", async function () {
            const gasUsed = ethers.BigNumber.from(50000);
            const gasPrice = await hancoin.gasPrice();
            const hnxzAmount = gasUsed.mul(gasPrice);
            
            await expect(hancoin.connect(paymaster).payGasInHNXZ(user1.address, gasUsed))
                .to.emit(hancoin, "GasUsed")
                .withArgs(user1.address, gasUsed, hnxzAmount);
        });
    });

    describe("Loan System", function () {
        let mockToken;

        beforeEach(async function () {
            // Deploy mock ERC20 token for collateral
            const MockToken = await ethers.getContractFactory("MockToken");
            mockToken = await MockToken.deploy("Mock USDC", "USDC", 6);
            await mockToken.deployed();

            // Setup collateral token
            await hancoin.setApprovedCollateralToken(mockToken.address, true);
            
            // Give user1 some tokens and collateral
            await hancoin.transfer(user1.address, ethers.utils.parseEther("1000"));
            await mockToken.mint(user1.address, ethers.utils.parseUnits("1000", 6));
        });

        it("Should allow users to request loans", async function () {
            const collateralAmount = ethers.utils.parseUnits("1000", 6); // 1000 USDC
            const loanAmount = ethers.utils.parseEther("750"); // 750 HNXZ
            
            // Approve collateral
            await mockToken.connect(user1).approve(hancoin.address, collateralAmount);
            
            // Request loan
            await hancoin.connect(user1).requestLoan(mockToken.address, collateralAmount, loanAmount);
            
            // Check loan details
            const loanDetails = await hancoin.getLoanDetails(1);
            expect(loanDetails.borrower).to.equal(user1.address);
            expect(loanDetails.loanAmount).to.equal(loanAmount);
            expect(loanDetails.isActive).to.be.true;
            
            // Check that user received loan tokens
            const userBalance = await hancoin.balanceOf(user1.address);
            expect(userBalance).to.equal(ethers.utils.parseEther("1750")); // 1000 + 750 loan
        });

        it("Should emit LoanRequested event", async function () {
            const collateralAmount = ethers.utils.parseUnits("1000", 6);
            const loanAmount = ethers.utils.parseEther("750");
            
            await mockToken.connect(user1).approve(hancoin.address, collateralAmount);
            
            await expect(hancoin.connect(user1).requestLoan(mockToken.address, collateralAmount, loanAmount))
                .to.emit(hancoin, "LoanRequested")
                .withArgs(1, user1.address, collateralAmount, loanAmount);
        });

        it("Should allow users to repay loans", async function () {
            const collateralAmount = ethers.utils.parseUnits("1000", 6);
            const loanAmount = ethers.utils.parseEther("750");
            
            // Approve and request loan
            await mockToken.connect(user1).approve(hancoin.address, collateralAmount);
            await hancoin.connect(user1).requestLoan(mockToken.address, collateralAmount, loanAmount);
            
            // Repay loan
            await hancoin.connect(user1).repayLoan(1);
            
            // Check loan is repaid
            const loanDetails = await hancoin.getLoanDetails(1);
            expect(loanDetails.isActive).to.be.false;
            expect(loanDetails.isRepaid).to.be.true;
            
            // Check collateral returned
            const collateralBalance = await mockToken.balanceOf(user1.address);
            expect(collateralBalance).to.equal(ethers.utils.parseUnits("1000", 6));
        });

        it("Should calculate repayment amount with interest", async function () {
            const collateralAmount = ethers.utils.parseUnits("1000", 6);
            const loanAmount = ethers.utils.parseEther("750");
            
            await mockToken.connect(user1).approve(hancoin.address, collateralAmount);
            await hancoin.connect(user1).requestLoan(mockToken.address, collateralAmount, loanAmount);
            
            // Fast forward time by 30 days
            await ethers.provider.send("evm_increaseTime", [30 * 24 * 60 * 60]);
            await ethers.provider.send("evm_mine");
            
            const repaymentAmount = await hancoin.calculateRepaymentAmount(1);
            expect(repaymentAmount).to.be.gt(loanAmount); // Should be more than principal
        });

        it("Should fail loan request for unapproved collateral", async function () {
            const fakeToken = await ethers.getContractFactory("MockToken");
            const fake = await fakeToken.deploy("Fake", "FAKE", 18);
            
            await expect(
                hancoin.connect(user1).requestLoan(fake.address, 1000, 750)
            ).to.be.revertedWith("HNXZ: Collateral token not approved");
        });

        it("Should fail if loan exceeds LTV ratio", async function () {
            const collateralAmount = ethers.utils.parseUnits("1000", 6);
            const loanAmount = ethers.utils.parseEther("900"); // 90% LTV (exceeds 75% limit)
            
            await mockToken.connect(user1).approve(hancoin.address, collateralAmount);
            
            await expect(
                hancoin.connect(user1).requestLoan(mockToken.address, collateralAmount, loanAmount)
            ).to.be.revertedWith("HNXZ: Loan amount exceeds maximum LTV ratio");
        });
    });

    describe("Escrow System", function () {
        beforeEach(async function () {
            // Give user1 some tokens
            await hancoin.transfer(user1.address, ethers.utils.parseEther("1000"));
        });

        it("Should allow users to create escrow", async function () {
            const escrowAmount = ethers.utils.parseEther("500");
            
            await hancoin.connect(user1).createEscrow(user2.address, escrowAmount);
            
            const escrowDetails = await hancoin.getEscrowDetails(1);
            expect(escrowDetails.sender).to.equal(user1.address);
            expect(escrowDetails.recipient).to.equal(user2.address);
            expect(escrowDetails.amount).to.equal(escrowAmount);
            expect(escrowDetails.isReleased).to.be.false;
        });

        it("Should emit EscrowCreated event", async function () {
            const escrowAmount = ethers.utils.parseEther("500");
            
            await expect(hancoin.connect(user1).createEscrow(user2.address, escrowAmount))
                .to.emit(hancoin, "EscrowCreated")
                .withArgs(1, user1.address, user2.address, escrowAmount);
        });

        it("Should allow sender to release escrow", async function () {
            const escrowAmount = ethers.utils.parseEther("500");
            
            await hancoin.connect(user1).createEscrow(user2.address, escrowAmount);
            await hancoin.connect(user1).releaseEscrow(1);
            
            const escrowDetails = await hancoin.getEscrowDetails(1);
            expect(escrowDetails.isReleased).to.be.true;
            
            // Check recipient received tokens
            const user2Balance = await hancoin.balanceOf(user2.address);
            expect(user2Balance).to.equal(escrowAmount);
        });

        it("Should allow sender to cancel escrow", async function () {
            const escrowAmount = ethers.utils.parseEther("500");
            const initialBalance = await hancoin.balanceOf(user1.address);
            
            await hancoin.connect(user1).createEscrow(user2.address, escrowAmount);
            await hancoin.connect(user1).cancelEscrow(1);
            
            const escrowDetails = await hancoin.getEscrowDetails(1);
            expect(escrowDetails.isCancelled).to.be.true;
            
            // Check sender got tokens back
            const finalBalance = await hancoin.balanceOf(user1.address);
            expect(finalBalance).to.equal(initialBalance);
        });

        it("Should fail if non-sender tries to release escrow", async function () {
            const escrowAmount = ethers.utils.parseEther("500");
            
            await hancoin.connect(user1).createEscrow(user2.address, escrowAmount);
            
            await expect(
                hancoin.connect(user2).releaseEscrow(1)
            ).to.be.revertedWith("HNXZ: Only sender can release escrow");
        });

        it("Should fail if trying to escrow to yourself", async function () {
            const escrowAmount = ethers.utils.parseEther("500");
            
            await expect(
                hancoin.connect(user1).createEscrow(user1.address, escrowAmount)
            ).to.be.revertedWith("HNXZ: Cannot escrow to yourself");
        });
    });

    describe("Credit Card Integration", function () {
        it("Should allow authorized providers to credit users", async function () {
            const creditAmount = ethers.utils.parseEther("1000");
            const initialBalance = await hancoin.balanceOf(user1.address);
            
            await hancoin.creditUser(user1.address, creditAmount);
            
            const finalBalance = await hancoin.balanceOf(user1.address);
            expect(finalBalance).to.equal(initialBalance.add(creditAmount));
        });

        it("Should emit UserCredited event", async function () {
            const creditAmount = ethers.utils.parseEther("1000");
            
            await expect(hancoin.creditUser(user1.address, creditAmount))
                .to.emit(hancoin, "UserCredited")
                .withArgs(user1.address, creditAmount, "Credit card purchase");
        });

        it("Should fail if unauthorized provider tries to credit", async function () {
            const creditAmount = ethers.utils.parseEther("1000");
            
            await expect(
                hancoin.connect(user1).creditUser(user2.address, creditAmount)
            ).to.be.revertedWith("HNXZ: Not authorized credit provider");
        });

        it("Should allow crediting with custom reference", async function () {
            const creditAmount = ethers.utils.parseEther("1000");
            const reference = "Payment ID: 12345";
            
            await expect(hancoin.creditUserWithReference(user1.address, creditAmount, reference))
                .to.emit(hancoin, "UserCredited")
                .withArgs(user1.address, creditAmount, reference);
        });
    });

    describe("Admin Functions", function () {
        it("Should allow owner to set gas price", async function () {
            const newGasPrice = ethers.utils.parseUnits("30", "gwei");
            
            await hancoin.setGasPrice(newGasPrice);
            
            const gasPrice = await hancoin.gasPrice();
            expect(gasPrice).to.equal(newGasPrice);
        });

        it("Should allow owner to authorize paymaster", async function () {
            const newPaymaster = user1.address;
            
            await expect(hancoin.setAuthorizedPaymaster(newPaymaster, true))
                .to.emit(hancoin, "PaymasterAuthorized")
                .withArgs(newPaymaster, true);
            
            const isAuthorized = await hancoin.authorizedPaymasters(newPaymaster);
            expect(isAuthorized).to.be.true;
        });

        it("Should allow owner to set loan parameters", async function () {
            const newInterestRate = 750; // 7.5%
            const newDuration = 180 * 24 * 60 * 60; // 180 days
            const newLtvRatio = 8000; // 80%
            
            await hancoin.setLoanParameters(newInterestRate, newDuration, newLtvRatio);
            
            expect(await hancoin.defaultInterestRate()).to.equal(newInterestRate);
            expect(await hancoin.defaultLoanDuration()).to.equal(newDuration);
            expect(await hancoin.maxLtvRatio()).to.equal(newLtvRatio);
        });

        it("Should fail if non-owner tries admin functions", async function () {
            await expect(
                hancoin.connect(user1).setGasPrice(1000)
            ).to.be.revertedWith("Ownable: caller is not the owner");
        });

        it("Should allow owner to pause and unpause", async function () {
            await hancoin.pause();
            expect(await hancoin.paused()).to.be.true;
            
            await hancoin.unpause();
            expect(await hancoin.paused()).to.be.false;
        });
    });

    describe("View Functions", function () {
        beforeEach(async function () {
            await hancoin.transfer(user1.address, ethers.utils.parseEther("1000"));
        });

        it("Should return user loans", async function () {
            const userLoans = await hancoin.getUserLoans(user1.address);
            expect(userLoans).to.be.an('array');
            expect(userLoans.length).to.equal(0);
        });

        it("Should return user escrows", async function () {
            const userEscrows = await hancoin.getUserEscrows(user1.address);
            expect(userEscrows).to.be.an('array');
            expect(userEscrows.length).to.equal(0);
        });
    });
});

// Mock token contract for testing
const MockTokenABI = [
    "constructor(string memory name, string memory symbol, uint8 decimals)",
    "function mint(address to, uint256 amount) external",
    "function balanceOf(address account) external view returns (uint256)",
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function transfer(address to, uint256 amount) external returns (bool)"
];