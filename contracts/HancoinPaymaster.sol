// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

// ERC-4337 interfaces
interface IEntryPoint {
    function handleOps(UserOperation[] calldata ops, address payable beneficiary) external;
    function depositTo(address account) external payable;
    function balanceOf(address account) external view returns (uint256);
    function withdrawTo(address payable withdrawAddress, uint256 withdrawAmount) external;
}

interface IPaymaster {
    function validatePaymasterUserOp(UserOperation calldata userOp, bytes32 userOpHash, uint256 maxCost)
        external returns (bytes memory context, uint256 validationData);
        
    function postOp(PostOpMode mode, bytes calldata context, uint256 actualGasCost) external;
}

// ERC-4337 structs
struct UserOperation {
    address sender;
    uint256 nonce;
    bytes initCode;
    bytes callData;
    uint256 callGasLimit;
    uint256 verificationGasLimit;
    uint256 preVerificationGas;
    uint256 maxFeePerGas;
    uint256 maxPriorityFeePerGas;
    bytes paymasterAndData;
    bytes signature;
}

enum PostOpMode {
    opSucceeded,
    opReverted,
    postOpReverted
}

// Hancoin interface
interface IHancoin {
    function balanceOf(address account) external view returns (uint256);
    function payGasInHNXZ(address user, uint256 gasUsed) external;
    function getGasDeposit(address user) external view returns (uint256);
    function gasPrice() external view returns (uint256);
    function authorizedPaymasters(address paymaster) external view returns (bool);
}

/**
 * @title HancoinPaymaster
 * @dev ERC-4337 Paymaster that sponsors transactions paid with HNXZ tokens
 */
contract HancoinPaymaster is IPaymaster, Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // ============ STATE VARIABLES ============
    
    IEntryPoint public immutable entryPoint;
    IHancoin public immutable hancoinToken;
    
    // Paymaster configuration
    uint256 public constant COST_OF_POST = 40000; // Gas cost for postOp
    uint256 public unaccountedEthBalance;
    
    // Exchange rate and pricing
    uint256 public hnxzToEthExchangeRate = 1000; // 1000 HNXZ = 1 ETH (adjustable)
    uint256 public gasOverhead = 34000; // Overhead gas for paymaster operations
    
    // User tracking
    mapping(address => uint256) public userGasSpent;
    mapping(address => bool) public authorizedRelayers;

    // ============ EVENTS ============
    
    event UserOperationSponsored(address indexed user, uint256 actualGasCost, uint256 hnxzCost);
    event ExchangeRateUpdated(uint256 oldRate, uint256 newRate);
    event ETHWithdrawn(address indexed to, uint256 amount);
    event ETHDeposited(address indexed from, uint256 amount);
    event RelayerAuthorized(address indexed relayer, bool authorized);

    // ============ MODIFIERS ============
    
    modifier onlyEntryPoint() {
        require(msg.sender == address(entryPoint), "HP: Only EntryPoint");
        _;
    }

    modifier onlyAuthorizedRelayer() {
        require(authorizedRelayers[msg.sender] || msg.sender == owner(), "HP: Not authorized relayer");
        _;
    }

    // ============ CONSTRUCTOR ============
    
    /**
     * @dev Initialize the paymaster with EntryPoint and Hancoin addresses
     * @param _entryPoint Address of the ERC-4337 EntryPoint contract
     * @param _hancoinToken Address of the Hancoin token contract
     */
    constructor(IEntryPoint _entryPoint, IHancoin _hancoinToken) {
        entryPoint = _entryPoint;
        hancoinToken = _hancoinToken;
        
        // Authorize deployer as relayer
        authorizedRelayers[msg.sender] = true;
    }

    // ============ ERC-4337 PAYMASTER FUNCTIONS ============

    /**
     * @dev Validate paymaster user operation (ERC-4337)
     * @param userOp The user operation to validate
     * @param userOpHash Hash of the user operation
     * @param maxCost Maximum cost of the operation
     * @return context Paymaster context for postOp
     * @return validationData Validation result
     */
    function validatePaymasterUserOp(UserOperation calldata userOp, bytes32 userOpHash, uint256 maxCost)
        external view override onlyEntryPoint returns (bytes memory context, uint256 validationData) {
        
        // Check if user has enough HNXZ tokens
        uint256 hnxzRequired = getRequiredHNXZ(maxCost);
        uint256 userHnxzBalance = hancoinToken.getGasDeposit(userOp.sender);
        
        if (userHnxzBalance < hnxzRequired) {
            return ("", 1); // Validation failed
        }
        
        // Check if paymaster is authorized in Hancoin contract
        if (!hancoinToken.authorizedPaymasters(address(this))) {
            return ("", 1); // Validation failed
        }
        
        // Encode context for postOp
        context = abi.encode(userOp.sender, hnxzRequired, maxCost);
        
        return (context, 0); // Validation passed
    }

    /**
     * @dev Post operation handling (ERC-4337)
     * @param mode Operation mode (success, revert, etc.)
     * @param context Context from validatePaymasterUserOp
     * @param actualGasCost Actual gas cost of the operation
     */
    function postOp(PostOpMode mode, bytes calldata context, uint256 actualGasCost) 
        external override onlyEntryPoint nonReentrant {
        
        // Decode context
        (address user, uint256 estimatedHnxzCost, uint256 maxCost) = abi.decode(context, (address, uint256, uint256));
        
        // Calculate actual HNXZ cost
        uint256 actualHnxzCost = getRequiredHNXZ(actualGasCost);
        
        // Charge user in HNXZ tokens
        try hancoinToken.payGasInHNXZ(user, actualGasCost / hancoinToken.gasPrice()) {
            // Update tracking
            userGasSpent[user] += actualGasCost;
            
            emit UserOperationSponsored(user, actualGasCost, actualHnxzCost);
            
        } catch {
            // If HNXZ payment fails, we still sponsored the transaction
            emit UserOperationSponsored(user, actualGasCost, 0);
        }
    }

    // ============ PAYMASTER MANAGEMENT ============

    /**
     * @dev Calculate required HNXZ tokens for a given ETH gas cost
     * @param ethCost Gas cost in ETH (wei)
     * @return Required HNXZ tokens
     */
    function getRequiredHNXZ(uint256 ethCost) public view returns (uint256) {
        // Convert ETH cost to HNXZ using exchange rate
        return (ethCost * hnxzToEthExchangeRate) / 1e18;
    }

    /**
     * @dev Get the estimated gas cost for a user operation
     * @param userOp The user operation
     * @return Estimated gas cost in ETH (wei)
     */
    function getEstimatedGasCost(UserOperation calldata userOp) external view returns (uint256) {
        uint256 gasUsed = userOp.callGasLimit + 
                         userOp.verificationGasLimit + 
                         userOp.preVerificationGas + 
                         gasOverhead;
        
        return gasUsed * userOp.maxFeePerGas;
    }

    /**
     * @dev Check if user can sponsor a transaction
     * @param user User address
     * @param estimatedCost Estimated gas cost in ETH
     * @return Whether user can afford the transaction
     */
    function canSponsorTransaction(address user, uint256 estimatedCost) external view returns (bool) {
        uint256 hnxzRequired = getRequiredHNXZ(estimatedCost);
        uint256 userHnxzBalance = hancoinToken.getGasDeposit(user);
        
        return userHnxzBalance >= hnxzRequired && 
               hancoinToken.authorizedPaymasters(address(this));
    }

    // ============ ADMIN FUNCTIONS ============

    /**
     * @dev Set HNXZ to ETH exchange rate
     * @param newRate New exchange rate (HNXZ per ETH)
     */
    function setExchangeRate(uint256 newRate) external onlyOwner {
        require(newRate > 0, "HP: Invalid exchange rate");
        
        uint256 oldRate = hnxzToEthExchangeRate;
        hnxzToEthExchangeRate = newRate;
        
        emit ExchangeRateUpdated(oldRate, newRate);
    }

    /**
     * @dev Set gas overhead for paymaster operations
     * @param newOverhead New gas overhead amount
     */
    function setGasOverhead(uint256 newOverhead) external onlyOwner {
        require(newOverhead <= 100000, "HP: Overhead too high");
        gasOverhead = newOverhead;
    }

    /**
     * @dev Authorize/deauthorize relayers
     * @param relayer Relayer address
     * @param authorized Whether relayer is authorized
     */
    function setAuthorizedRelayer(address relayer, bool authorized) external onlyOwner {
        authorizedRelayers[relayer] = authorized;
        emit RelayerAuthorized(relayer, authorized);
    }

    /**
     * @dev Deposit ETH into EntryPoint for sponsoring transactions
     */
    function depositToEntryPoint() external payable onlyOwner {
        entryPoint.depositTo{value: msg.value}(address(this));
        emit ETHDeposited(msg.sender, msg.value);
    }

    /**
     * @dev Withdraw ETH from EntryPoint
     * @param withdrawAddress Address to withdraw to
     * @param amount Amount to withdraw
     */
    function withdrawFromEntryPoint(address payable withdrawAddress, uint256 amount) external onlyOwner {
        entryPoint.withdrawTo(withdrawAddress, amount);
        emit ETHWithdrawn(withdrawAddress, amount);
    }

    /**
     * @dev Emergency pause
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @dev Unpause
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    // ============ VIEW FUNCTIONS ============

    /**
     * @dev Get paymaster's balance in EntryPoint
     * @return Balance in wei
     */
    function getEntryPointBalance() external view returns (uint256) {
        return entryPoint.balanceOf(address(this));
    }

    /**
     * @dev Get user's total gas spent through this paymaster
     * @param user User address
     * @return Total gas spent in wei
     */
    function getUserGasSpent(address user) external view returns (uint256) {
        return userGasSpent[user];
    }

    /**
     * @dev Check if paymaster can sponsor a specific amount
     * @param amount Amount in ETH to sponsor
     * @return Whether paymaster has sufficient balance
     */
    function canSponsorAmount(uint256 amount) external view returns (bool) {
        return entryPoint.balanceOf(address(this)) >= amount;
    }

    // ============ RECEIVE FUNCTION ============

    /**
     * @dev Allow contract to receive ETH
     */
    receive() external payable {
        emit ETHDeposited(msg.sender, msg.value);
    }
}