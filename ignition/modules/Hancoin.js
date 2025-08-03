// This setup uses Hardhat Ignition to manage smart contract deployments.
const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");

// Known ERC-4337 EntryPoint addresses
const ENTRY_POINT_ADDRESSES = {
    mainnet: "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",
    sepolia: "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",
    polygon: "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",
    arbitrum: "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",
    optimism: "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",
    localhost: null, // Will deploy mock
    hardhat: null
};

module.exports = buildModule("HancoinModule", (m) => {
    // Get network information
    const network = m.getParameter("network", "localhost");
    
    // ============ DEPLOY OR USE EXISTING ENTRYPOINT ============
    
    let entryPoint;
    const existingEntryPoint = ENTRY_POINT_ADDRESSES[network];
    
    if (existingEntryPoint) {
        // Use existing EntryPoint on known networks
        console.log(`Using existing EntryPoint at: ${existingEntryPoint}`);
        entryPoint = m.contractAt("IEntryPoint", existingEntryPoint);
    } else {
        // Deploy mock EntryPoint for local testing
        console.log("Deploying MockEntryPoint for local testing...");
        entryPoint = m.contract("MockEntryPoint", []);
    }

    // ============ DEPLOY HANCOIN TOKEN ============
    
    const hancoin = m.contract("Hancoin", []);

    // ============ DEPLOY HANCOIN PAYMASTER ============
    
    const paymaster = m.contract("HancoinPaymaster", [entryPoint, hancoin]);

    // ============ SETUP CONFIGURATION ============
    
    // Authorize paymaster in Hancoin
    m.call(hancoin, "setAuthorizedPaymaster", [paymaster, true], {
        id: "authorize_paymaster"
    });

    // Set initial exchange rate (1000 HNXZ = 1 ETH)
    const initialExchangeRate = m.getParameter("exchangeRate", 1000);
    m.call(paymaster, "setExchangeRate", [initialExchangeRate], {
        id: "set_exchange_rate"
    });

    // Deposit initial ETH to paymaster (if specified)
    const initialDeposit = m.getParameter("initialDeposit", "0");
    if (initialDeposit !== "0") {
        m.call(paymaster, "depositToEntryPoint", [], {
            value: initialDeposit,
            id: "initial_deposit"
        });
    }

    // Approve HNXZ as collateral token for testing
    m.call(hancoin, "setApprovedCollateralToken", [hancoin, true], {
        id: "approve_hnxz_collateral"
    });

    // Set loan parameters
    m.call(hancoin, "setLoanParameters", [
        500,                    // 5% annual interest
        365 * 24 * 60 * 60,    // 1 year duration
        7500                   // 75% LTV ratio
    ], {
        id: "set_loan_parameters"
    });

    return { 
        hancoin, 
        paymaster, 
        entryPoint,
        // Export addresses for easy access
        hancoinAddress: hancoin,
        paymasterAddress: paymaster,
        entryPointAddress: entryPoint
    };
});