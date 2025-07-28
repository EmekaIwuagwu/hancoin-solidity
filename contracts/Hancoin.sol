// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

/**
 * @title Hancoin (HNXZ) - Paymaster Token with Lending and Escrow
 * @dev ERC-20 token with gas abstraction, lending system, and escrow functionality
 * @author Emeka Iwuagwu (emeka@hanpay.xyz)
 */
contract Hancoin is ERC20, Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // ============ STATE VARIABLES ============

    // Paymaster configuration
    uint256 public gasPrice = 15 gwei; // Default gas price in HNXZ tokens
    mapping(address => uint256) public gasDeposits; // User gas deposits in HNXZ
    mapping(address => bool) public authorizedPaymasters; // Authorized paymaster contracts

    // Loan system
    struct Loan {
        uint256 id;
        address borrower;
        address collateralToken;
        uint256 collateralAmount;
        uint256 loanAmount;
        uint256 interestRate; // Annual interest rate in basis points (e.g., 500 = 5%)
        uint256 startTime;
        uint256 duration; // Loan duration in seconds
        bool isActive;
        bool isRepaid;
    }

    uint256 public nextLoanId = 1;
    mapping(uint256 => Loan) public loans;
    mapping(address => uint256[]) public userLoans;
    mapping(address => bool) public approvedCollateralTokens;
    
    // Loan configuration
    uint256 public defaultInterestRate = 500; // 5% annual interest
    uint256 public defaultLoanDuration = 365 days;
    uint256 public maxLtvRatio = 7500; // 75% max loan-to-value ratio (in basis points)

    // Escrow system
    struct Escrow {
        uint256 id;
        address sender;
        address recipient;
        uint256 amount;
        uint256 createdAt;
        bool isReleased;
        bool isCancelled;
    }

    uint256 public nextEscrowId = 1;
    mapping(uint256 => Escrow) public escrows;
    mapping(address => uint256[]) public userEscrows;

    // Credit card integration
    mapping(address => bool) public authorizedCreditProviders;

    // ============ EVENTS ============

    // Paymaster events
    event GasDepositMade(address indexed user, uint256 amount);
    event GasUsed(address indexed user, uint256 gasAmount, uint256 hnxzAmount);
    event PaymasterAuthorized(address indexed paymaster, bool authorized);

    // Loan events
    event LoanRequested(uint256 indexed loanId, address indexed borrower, uint256 collateralAmount, uint256 loanAmount);
    event LoanRepaid(uint256 indexed loanId, address indexed borrower, uint256 repaymentAmount);
    event CollateralTokenApproved(address indexed token, bool approved);

    // Escrow events
    event EscrowCreated(uint256 indexed escrowId, address indexed sender, address indexed recipient, uint256 amount);
    event EscrowReleased(uint256 indexed escrowId, address indexed sender, address indexed recipient, uint256 amount);
    event EscrowCancelled(uint256 indexed escrowId, address indexed sender, uint256 amount);

    // Credit card events
    event UserCredited(address indexed user, uint256 amount, string paymentReference);
    event CreditProviderAuthorized(address indexed provider, bool authorized);

    // ============ MODIFIERS ============

    modifier onlyAuthorizedPaymaster() {
        require(authorizedPaymasters[msg.sender], "HNXZ: Not authorized paymaster");
        _;
    }

    modifier onlyAuthorizedCreditProvider() {
        require(authorizedCreditProviders[msg.sender], "HNXZ: Not authorized credit provider");
        _;
    }

    modifier validLoan(uint256 loanId) {
        require(loanId > 0 && loanId < nextLoanId, "HNXZ: Invalid loan ID");
        require(loans[loanId].isActive, "HNXZ: Loan not active");
        _;
    }

    modifier validEscrow(uint256 escrowId) {
        require(escrowId > 0 && escrowId < nextEscrowId, "HNXZ: Invalid escrow ID");
        require(!escrows[escrowId].isReleased && !escrows[escrowId].isCancelled, "HNXZ: Escrow already processed");
        _;
    }

    // ============ CONSTRUCTOR ============

    /**
     * @dev Initialize Hancoin token with 1B total supply
     */
    constructor() ERC20("Hancoin", "HNXZ") {
        // Mint initial supply to contract deployer
        _mint(msg.sender, 1_000_000_000 * 10**decimals());
        
        // Authorize deployer as initial credit provider
        authorizedCreditProviders[msg.sender] = true;
    }

    // ============ PAYMASTER FUNCTIONALITY ============

    /**
     * @dev Deposit HNXZ tokens to cover gas fees for future transactions
     * @param amount Amount of HNXZ tokens to deposit for gas payments
     */
    function depositForGas(uint256 amount) external whenNotPaused {
        require(amount > 0, "HNXZ: Amount must be greater than 0");
        require(balanceOf(msg.sender) >= amount, "HNXZ: Insufficient balance");

        _transfer(msg.sender, address(this), amount);
        gasDeposits[msg.sender] += amount;

        emit GasDepositMade(msg.sender, amount);
    }

    /**
     * @dev Withdraw unused gas deposits back to user
     * @param amount Amount of HNXZ tokens to withdraw from gas deposits
     */
    function withdrawGasDeposit(uint256 amount) external nonReentrant {
        require(amount > 0, "HNXZ: Amount must be greater than 0");
        require(gasDeposits[msg.sender] >= amount, "HNXZ: Insufficient gas deposit");

        gasDeposits[msg.sender] -= amount;
        _transfer(address(this), msg.sender, amount);
    }

    /**
     * @dev Pay gas fees using HNXZ tokens (called by authorized paymaster)
     * @param user User whose gas is being paid
     * @param gasUsed Amount of gas used in the transaction
     */
    function payGasInHNXZ(address user, uint256 gasUsed) external onlyAuthorizedPaymaster whenNotPaused {
        uint256 hnxzRequired = gasUsed * gasPrice;
        require(gasDeposits[user] >= hnxzRequired, "HNXZ: Insufficient gas deposit");

        gasDeposits[user] -= hnxzRequired;
        // Burn the HNXZ tokens used for gas (or send to treasury)
        _burn(address(this), hnxzRequired);

        emit GasUsed(user, gasUsed, hnxzRequired);
    }

    /**
     * @dev Set gas price in HNXZ tokens per gas unit
     * @param newGasPrice New gas price in HNXZ tokens
     */
    function setGasPrice(uint256 newGasPrice) external onlyOwner {
        require(newGasPrice > 0, "HNXZ: Gas price must be greater than 0");
        gasPrice = newGasPrice;
    }

    /**
     * @dev Authorize/deauthorize paymaster contracts
     * @param paymaster Address of the paymaster contract
     * @param authorized Whether the paymaster is authorized
     */
    function setAuthorizedPaymaster(address paymaster, bool authorized) external onlyOwner {
        authorizedPaymasters[paymaster] = authorized;
        emit PaymasterAuthorized(paymaster, authorized);
    }

    // ============ LOAN SYSTEM ============

    /**
     * @dev Request a loan by providing collateral
     * @param collateralToken Address of the ERC-20 token to use as collateral
     * @param collateralAmount Amount of collateral tokens to deposit
     * @param loanAmount Amount of HNXZ tokens to borrow
     */
    function requestLoan(
        address collateralToken,
        uint256 collateralAmount,
        uint256 loanAmount
    ) external nonReentrant whenNotPaused {
        require(approvedCollateralTokens[collateralToken], "HNXZ: Collateral token not approved");
        require(collateralAmount > 0, "HNXZ: Collateral amount must be greater than 0");
        require(loanAmount > 0, "HNXZ: Loan amount must be greater than 0");

        // Check loan-to-value ratio (simplified - assumes 1:1 USD value for demo)
        uint256 maxLoanAmount = (collateralAmount * maxLtvRatio) / 10000;
        require(loanAmount <= maxLoanAmount, "HNXZ: Loan amount exceeds maximum LTV ratio");

        // Transfer collateral to contract
        IERC20(collateralToken).safeTransferFrom(msg.sender, address(this), collateralAmount);

        // Create loan record
        uint256 loanId = nextLoanId++;
        loans[loanId] = Loan({
            id: loanId,
            borrower: msg.sender,
            collateralToken: collateralToken,
            collateralAmount: collateralAmount,
            loanAmount: loanAmount,
            interestRate: defaultInterestRate,
            startTime: block.timestamp,
            duration: defaultLoanDuration,
            isActive: true,
            isRepaid: false
        });

        userLoans[msg.sender].push(loanId);

        // Mint HNXZ tokens to borrower
        _mint(msg.sender, loanAmount);

        emit LoanRequested(loanId, msg.sender, collateralAmount, loanAmount);
    }

    /**
     * @dev Repay a loan and retrieve collateral
     * @param loanId ID of the loan to repay
     */
    function repayLoan(uint256 loanId) external nonReentrant validLoan(loanId) {
        Loan storage loan = loans[loanId];
        require(loan.borrower == msg.sender, "HNXZ: Not loan borrower");

        // Calculate total repayment amount (principal + interest)
        uint256 repaymentAmount = calculateRepaymentAmount(loanId);
        require(balanceOf(msg.sender) >= repaymentAmount, "HNXZ: Insufficient balance for repayment");

        // Mark loan as repaid
        loan.isActive = false;
        loan.isRepaid = true;

        // Burn the repaid HNXZ tokens
        _burn(msg.sender, repaymentAmount);

        // Return collateral to borrower
        IERC20(loan.collateralToken).safeTransfer(msg.sender, loan.collateralAmount);

        emit LoanRepaid(loanId, msg.sender, repaymentAmount);
    }

    /**
     * @dev Calculate the total repayment amount for a loan
     * @param loanId ID of the loan
     * @return Total amount to repay (principal + interest)
     */
    function calculateRepaymentAmount(uint256 loanId) public view returns (uint256) {
        Loan memory loan = loans[loanId];
        if (!loan.isActive) return 0;

        uint256 timeElapsed = block.timestamp - loan.startTime;
        uint256 interest = (loan.loanAmount * loan.interestRate * timeElapsed) / (10000 * 365 days);
        return loan.loanAmount + interest;
    }

    /**
     * @dev Get detailed information about a loan
     * @param loanId ID of the loan
     * @return Loan struct with all loan details
     */
    function getLoanDetails(uint256 loanId) external view returns (Loan memory) {
        return loans[loanId];
    }

    /**
     * @dev Approve/disapprove collateral tokens for loans
     * @param token Address of the token to approve/disapprove
     * @param approved Whether the token is approved as collateral
     */
    function setApprovedCollateralToken(address token, bool approved) external onlyOwner {
        approvedCollateralTokens[token] = approved;
        emit CollateralTokenApproved(token, approved);
    }

    // ============ ESCROW SYSTEM ============

    /**
     * @dev Create an escrow payment to another address
     * @param recipient Address that will receive the escrowed funds
     * @param amount Amount of HNXZ tokens to escrow
     */
    function createEscrow(address recipient, uint256 amount) external nonReentrant whenNotPaused {
        require(recipient != address(0), "HNXZ: Invalid recipient address");
        require(recipient != msg.sender, "HNXZ: Cannot escrow to yourself");
        require(amount > 0, "HNXZ: Escrow amount must be greater than 0");
        require(balanceOf(msg.sender) >= amount, "HNXZ: Insufficient balance");

        // Transfer tokens to contract for escrow
        _transfer(msg.sender, address(this), amount);

        // Create escrow record
        uint256 escrowId = nextEscrowId++;
        escrows[escrowId] = Escrow({
            id: escrowId,
            sender: msg.sender,
            recipient: recipient,
            amount: amount,
            createdAt: block.timestamp,
            isReleased: false,
            isCancelled: false
        });

        userEscrows[msg.sender].push(escrowId);

        emit EscrowCreated(escrowId, msg.sender, recipient, amount);
    }

    /**
     * @dev Release escrowed funds to the recipient (only callable by sender)
     * @param escrowId ID of the escrow to release
     */
    function releaseEscrow(uint256 escrowId) external nonReentrant validEscrow(escrowId) {
        Escrow storage escrow = escrows[escrowId];
        require(escrow.sender == msg.sender, "HNXZ: Only sender can release escrow");

        // Mark escrow as released
        escrow.isReleased = true;

        // Transfer tokens to recipient
        _transfer(address(this), escrow.recipient, escrow.amount);

        emit EscrowReleased(escrowId, escrow.sender, escrow.recipient, escrow.amount);
    }

    /**
     * @dev Cancel an escrow and return funds to sender (only callable by sender)
     * @param escrowId ID of the escrow to cancel
     */
    function cancelEscrow(uint256 escrowId) external nonReentrant validEscrow(escrowId) {
        Escrow storage escrow = escrows[escrowId];
        require(escrow.sender == msg.sender, "HNXZ: Only sender can cancel escrow");

        // Mark escrow as cancelled
        escrow.isCancelled = true;

        // Return tokens to sender
        _transfer(address(this), escrow.sender, escrow.amount);

        emit EscrowCancelled(escrowId, escrow.sender, escrow.amount);
    }

    /**
     * @dev Get escrow details
     * @param escrowId ID of the escrow
     * @return Escrow struct with all escrow details
     */
    function getEscrowDetails(uint256 escrowId) external view returns (Escrow memory) {
        return escrows[escrowId];
    }

    // ============ CREDIT CARD INTEGRATION ============

    /**
     * @dev Credit HNXZ tokens to user after credit card purchase verification
     * @param user Address of the user to credit
     * @param amount Amount of HNXZ tokens to mint and credit
     */
    function creditUser(address user, uint256 amount) external onlyAuthorizedCreditProvider whenNotPaused {
        require(user != address(0), "HNXZ: Invalid user address");
        require(amount > 0, "HNXZ: Credit amount must be greater than 0");

        // Mint HNXZ tokens to user
        _mint(user, amount);

        emit UserCredited(user, amount, "Credit card purchase");
    }

    /**
     * @dev Credit HNXZ tokens with payment reference
     * @param user Address of the user to credit
     * @param amount Amount of HNXZ tokens to mint and credit
     * @param paymentReference Reference string for the payment
     */
    function creditUserWithReference(
        address user, 
        uint256 amount, 
        string memory paymentReference
    ) external onlyAuthorizedCreditProvider whenNotPaused {
        require(user != address(0), "HNXZ: Invalid user address");
        require(amount > 0, "HNXZ: Credit amount must be greater than 0");

        // Mint HNXZ tokens to user
        _mint(user, amount);

        emit UserCredited(user, amount, paymentReference);
    }

    /**
     * @dev Authorize/deauthorize credit card providers
     * @param provider Address of the credit card provider
     * @param authorized Whether the provider is authorized
     */
    function setAuthorizedCreditProvider(address provider, bool authorized) external onlyOwner {
        authorizedCreditProviders[provider] = authorized;
        emit CreditProviderAuthorized(provider, authorized);
    }

    // ============ ADMIN FUNCTIONS ============

    /**
     * @dev Set default loan parameters
     * @param interestRate Annual interest rate in basis points
     * @param duration Loan duration in seconds
     * @param ltvRatio Maximum loan-to-value ratio in basis points
     */
    function setLoanParameters(
        uint256 interestRate,
        uint256 duration,
        uint256 ltvRatio
    ) external onlyOwner {
        require(interestRate <= 5000, "HNXZ: Interest rate too high"); // Max 50%
        require(duration >= 1 days, "HNXZ: Duration too short");
        require(ltvRatio <= 9000, "HNXZ: LTV ratio too high"); // Max 90%

        defaultInterestRate = interestRate;
        defaultLoanDuration = duration;
        maxLtvRatio = ltvRatio;
    }

    /**
     * @dev Emergency pause contract
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @dev Unpause contract
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @dev Emergency withdrawal of stuck tokens (only owner)
     * @param token Address of token to withdraw (use address(0) for ETH)
     * @param amount Amount to withdraw
     */
    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        if (token == address(0)) {
            payable(owner()).transfer(amount);
        } else {
            IERC20(token).safeTransfer(owner(), amount);
        }
    }

    // ============ VIEW FUNCTIONS ============

    /**
     * @dev Get user's loans
     * @param user Address of the user
     * @return Array of loan IDs for the user
     */
    function getUserLoans(address user) external view returns (uint256[] memory) {
        return userLoans[user];
    }

    /**
     * @dev Get user's escrows
     * @param user Address of the user
     * @return Array of escrow IDs for the user
     */
    function getUserEscrows(address user) external view returns (uint256[] memory) {
        return userEscrows[user];
    }

    /**
     * @dev Get user's gas deposit balance
     * @param user Address of the user
     * @return Amount of HNXZ tokens deposited for gas payments
     */
    function getGasDeposit(address user) external view returns (uint256) {
        return gasDeposits[user];
    }

    // ============ RECEIVE FUNCTION ============

    /**
     * @dev Allow contract to receive ETH
     */
    receive() external payable {}
}