// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title IHancoin
 * @dev Interface for Hancoin token with gas abstraction features
 */
interface IHancoin is IERC20 {
    
    // ============ GAS ABSTRACTION ============
    
    function depositForGas(uint256 amount) external;
    function withdrawGasDeposit(uint256 amount) external;
    function payGasInHNXZ(address user, uint256 gasUsed) external;
    function getGasDeposit(address user) external view returns (uint256);
    function canPayGas(address user, uint256 estimatedGas) external view returns (bool);
    function getRequiredHNXZForGas(uint256 gasAmount) external view returns (uint256);
    function gasPrice() external view returns (uint256);
    function authorizedPaymasters(address paymaster) external view returns (bool);
    
    // ============ LOAN SYSTEM ============
    
    struct Loan {
        uint256 id;
        address borrower;
        address collateralToken;
        uint256 collateralAmount;
        uint256 loanAmount;
        uint256 interestRate;
        uint256 startTime;
        uint256 duration;
        bool isActive;
        bool isRepaid;
    }
    
    function requestLoan(address collateralToken, uint256 collateralAmount, uint256 loanAmount) external;
    function repayLoan(uint256 loanId) external;
    function calculateRepaymentAmount(uint256 loanId) external view returns (uint256);
    function getLoanDetails(uint256 loanId) external view returns (Loan memory);
    function getUserLoans(address user) external view returns (uint256[] memory);
    
    // ============ ESCROW SYSTEM ============
    
    struct Escrow {
        uint256 id;
        address sender;
        address recipient;
        uint256 amount;
        uint256 createdAt;
        bool isReleased;
        bool isCancelled;
    }
    
    function createEscrow(address recipient, uint256 amount) external;
    function releaseEscrow(uint256 escrowId) external;
    function cancelEscrow(uint256 escrowId) external;
    function getEscrowDetails(uint256 escrowId) external view returns (Escrow memory);
    function getUserEscrows(address user) external view returns (uint256[] memory);
    
    // ============ CREDIT CARD INTEGRATION ============
    
    function creditUser(address user, uint256 amount) external;
    function creditUserWithReference(address user, uint256 amount, string memory paymentReference) external;
    
    // ============ EVENTS ============
    
    event GasDepositMade(address indexed user, uint256 amount);
    event GasUsed(address indexed user, uint256 gasAmount, uint256 hnxzAmount);
    event LoanRequested(uint256 indexed loanId, address indexed borrower, uint256 collateralAmount, uint256 loanAmount);
    event LoanRepaid(uint256 indexed loanId, address indexed borrower, uint256 repaymentAmount);
    event EscrowCreated(uint256 indexed escrowId, address indexed sender, address indexed recipient, uint256 amount);
    event EscrowReleased(uint256 indexed escrowId, address indexed sender, address indexed recipient, uint256 amount);
    event UserCredited(address indexed user, uint256 amount, string paymentReference);
}