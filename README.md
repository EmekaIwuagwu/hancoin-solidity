# 🪙 Hancoin (HNXZ) - Gas Abstraction Token

**Hancoin** is an innovative ERC-20 token with built-in **gas abstraction** capabilities, allowing users to pay transaction fees using HNXZ tokens instead of ETH. This project demonstrates advanced Hardhat usage with gas-efficient smart contracts and Account Abstraction features.

## ✨ Features

- **Gas Abstraction**: Pay transaction fees with HNXZ instead of ETH
- **ERC-4337 Compatible**: Full Account Abstraction support
- **DeFi Integration**: Lending, escrow, and credit card payment capabilities
- **Optimized Supply**: 1 billion HNXZ tokens with 18 decimals
- **Hardhat Testing Suite**: Comprehensive test coverage and deployment scripts

## 📊 Token Details

| Property | Value |
|----------|--------|
| **Name** | Hancoin |
| **Symbol** | HNXZ |
| **Decimals** | 18 |
| **Total Supply** | 1,000,000,000 HNXZ |
| **Standard** | ERC-20 with ERC-4337 extensions |

## 🚀 Quick Start

### Prerequisites

- **Node.js** v16+ 
- **npm** or **yarn**
- **MetaMask** or compatible Web3 wallet
- **Git** for version control

### Installation

```bash
# Clone the repository
git clone https://github.com/EmekaIwuagwu/hancoin-solidity.git
cd hancoin-project

# Install dependencies
npm install

# Configure environment variables
cp .env.example .env
# Edit .env with your private keys and RPC URLs
```

### Environment Setup

Create a `.env` file with the following variables:

```env
PRIVATE_KEY=your_private_key_here
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/your_infura_key
ETHERSCAN_API_KEY=your_etherscan_api_key
COINMARKETCAP_API_KEY=your_cmc_api_key_for_gas_reporting
```

## 🛠️ Development Commands

### Compilation and Testing

```bash
# Compile smart contracts
npm run compile
# or
npx hardhat compile

# Run test suite
npm test
# or
npx hardhat test

# Run tests with gas reporting
REPORT_GAS=true npx hardhat test

# Get help with available commands
npx hardhat help
```

### Local Development

```bash
# Start local Hardhat node
npx hardhat node

# Deploy to local network (in separate terminal)
npx hardhat ignition deploy ./ignition/modules/Hancoin.js --network localhost
```

### Testnet Deployment

```bash
# Deploy to Sepolia testnet
npm run deploy:sepolia
# or
npx hardhat ignition deploy ./ignition/modules/Hancoin.js --network sepolia

# Setup initial configuration
npm run setup:sepolia

# Verify contracts on Etherscan
npx hardhat verify --network sepolia <CONTRACT_ADDRESS>
```

## 📁 Project Structure

```
hancoin-project/
├── contracts/              # Smart contracts
│   ├── Hancoin.sol         # Main token contract
│   ├── GasAbstraction.sol  # Gas abstraction logic
│   └── interfaces/         # Contract interfaces
├── test/                   # Test files
│   ├── Hancoin.test.js     # Token tests
│   └── GasAbstraction.test.js
├── ignition/               # Deployment modules
│   └── modules/
│       └── Hancoin.js      # Deployment script
├── scripts/                # Utility scripts
├── hardhat.config.js       # Hardhat configuration
├── package.json           # Dependencies
└── README.md              # This file
```

## 🧪 Testing

The project includes comprehensive test coverage:

```bash
# Run all tests
npx hardhat test

# Run specific test file
npx hardhat test test/Hancoin.test.js

# Run tests with coverage report
npx hardhat coverage

# Run tests on specific network
npx hardhat test --network localhost
```

## 🌐 Deployment Networks

### Supported Networks

- **Local**: Hardhat local node
- **Sepolia**: Ethereum testnet
- **Mainnet**: Ethereum mainnet (production)

### Network Configuration

Networks are configured in `hardhat.config.js`. To add a new network:

```javascript
networks: {
  yourNetwork: {
    url: "YOUR_RPC_URL",
    accounts: [process.env.PRIVATE_KEY]
  }
}
```

## 🔧 Gas Abstraction Usage

Hancoin implements ERC-4337 Account Abstraction for gas-free transactions:

```javascript
// Example: Pay transaction fees with HNXZ tokens
const tx = await hancoinContract.transferWithGasToken(
  recipient,
  amount,
  gasTokenAmount
);
```

## 📚 Smart Contract Architecture

### Core Contracts

1. **Hancoin.sol**: Main ERC-20 token with gas abstraction
2. **GasAbstraction.sol**: Handles fee payments in HNXZ
3. **PaymasterContract.sol**: ERC-4337 paymaster implementation

### Key Functions

- `transfer()`: Standard ERC-20 transfer
- `transferWithGasToken()`: Transfer with gas paid in HNXZ
- `approveGasPayment()`: Approve gas payments
- `estimateGasCost()`: Calculate gas costs in HNXZ

## 🛡️ Security

- **Audited Contracts**: Based on OpenZeppelin standards
- **Reentrancy Protection**: SafeMath and ReentrancyGuard
- **Access Control**: Role-based permissions
- **Test Coverage**: >95% code coverage

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Follow Solidity style guide
- Add tests for new features
- Update documentation
- Ensure gas optimization

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🔗 Links

- **Documentation**: [docs.hancoin.io](https://docs.hancoin.io)
- **Whitepaper**: [whitepaper.hancoin.io](https://whitepaper.hancoin.io)
- **Discord**: [discord.gg/hancoin](https://discord.gg/hancoin)
- **Twitter**: [@HancoinHNXZ](https://twitter.com/HancoinHNXZ)

## ⚠️ Disclaimer

Hancoin is experimental software. Use at your own risk. This project is for educational and development purposes. Always audit smart contracts before mainnet deployment.

---

**Built with ❤️ using Hardhat, OpenZeppelin, and ERC-4337**