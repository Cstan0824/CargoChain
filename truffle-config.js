// truffle-config.js — CargoChain
// Active: Ganache on 127.0.0.1:7545, chainId 1337, network_id *.
// Future plan: Sepolia (commented below — do NOT enable in v1).

require('dotenv').config();
const HDWalletProvider = require('@truffle/hdwallet-provider');

module.exports = {
  networks: {
    development: {
      host: '127.0.0.1',
      port: 7545,
      network_id: '*',
    },

    // =========================================================================
    // FUTURE PLAN — Sepolia testnet
    // -------------------------------------------------------------------------
    // Not part of v1. The team has explicitly deferred Sepolia to a later
    // milestone. To activate, uncomment the block below, fill in `.env`
    // (SEPOLIA_RPC, TEAM_MNEMONIC), and run:
    //   npx truffle migrate --network sepolia
    // =========================================================================
    // sepolia: {
    //   provider: () => new HDWalletProvider(
    //     process.env.TEAM_MNEMONIC,
    //     process.env.SEPOLIA_RPC,
    //   ),
    //   network_id: 11155111,
    //   confirmations: 2,
    // },
  },

  contracts_directory: './contracts',
  contracts_build_directory: './build/contracts',

  compilers: {
    solc: {
      version: '^0.8.0',
      settings: {
        optimizer: {
          enabled: true,
          runs: 200,
        },
      },
    },
  },

  mocha: {
    timeout: 60000, // Ganache deploy + time-travel tests can take longer than default
  },
};
