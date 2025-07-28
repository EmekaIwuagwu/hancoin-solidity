# Hancoin Project

This project demonstrates a basic Hardhat use case. It comes with a sample contract, a test for that contract, and a Hardhat Ignition module that deploys that contract.

Try running some of the following tasks:

```shell
npx hardhat help
npx hardhat test
REPORT_GAS=true npx hardhat test# 🪙 Hancoin (HNXZ) - Gas Abstraction Token

**Hancoin** is an innovative ERC-20 token with built-in **gas abstraction** capabilities, allowing users to pay transaction fees using HNXZ tokens instead of ETH.

## ✨ Features

- **Gas Abstraction**: Pay fees with HNXZ instead of ETH
- **ERC-4337 Compatible**: Full Account Abstraction support
- **DeFi Features**: Lending, escrow, and credit card integration
- **1 Billion Supply**: HNXZ tokens with 18 decimals

## 📊 Token Details

| Property | Value |
|----------|--------|
| **Name** | Hancoin |
| **Symbol** | HNXZ |
| **Decimals** | 18 |
| **Total Supply** | 1,000,000,000 HNXZ |

## 🚀 Quick Start

### Prerequisites
- Node.js v16+
- MetaMask or compatible wallet

### Installation

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your values

# Compile contracts
npm run compile

# Deploy to testnet
npm run deploy:sepolia
npm run setup:sepolia
npx hardhat node
npx hardhat ignition deploy ./ignition/modules/Lock.js
```
