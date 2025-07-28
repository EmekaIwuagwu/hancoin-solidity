// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title MockEntryPoint
 * @dev Simple mock implementation of ERC-4337 EntryPoint for local testing
 */
contract MockEntryPoint {
    mapping(address => uint256) public balanceOf;
    mapping(address => uint256) public nonces;

    event Deposited(address indexed account, uint256 totalDeposit);
    event Withdrawn(address indexed account, address withdrawAddress, uint256 amount);

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

    /**
     * @dev Deposit ETH for an account
     */
    function depositTo(address account) external payable {
        balanceOf[account] += msg.value;
        emit Deposited(account, balanceOf[account]);
    }

    /**
     * @dev Withdraw ETH from account balance
     */
    function withdrawTo(address payable withdrawAddress, uint256 withdrawAmount) external {
        require(balanceOf[msg.sender] >= withdrawAmount, "Insufficient balance");
        balanceOf[msg.sender] -= withdrawAmount;
        withdrawAddress.transfer(withdrawAmount);
        emit Withdrawn(msg.sender, withdrawAddress, withdrawAmount);
    }

    /**
     * @dev Get nonce for account
     */
    function getNonce(address sender, uint192 key) external view returns (uint256) {
        return nonces[sender];
    }

    /**
     * @dev Simple mock implementation of handleOps
     */
    function handleOps(UserOperation[] calldata ops, address payable beneficiary) external {
        for (uint256 i = 0; i < ops.length; i++) {
            nonces[ops[i].sender]++;
        }
    }

    /**
     * @dev Allow contract to receive ETH
     */
    receive() external payable {
        balanceOf[msg.sender] += msg.value;
        emit Deposited(msg.sender, balanceOf[msg.sender]);
    }
}