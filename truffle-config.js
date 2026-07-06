// truffle-config.js — CargoChain
// Defaults: Ganache on 127.0.0.1:7545, chainId 1337, network_id *.

module.exports = {
  networks: {
    development: {
      host: '127.0.0.1',
      port: 7545,
      network_id: '*',
    },
    // Optional Sepolia deployment — fill in your own keys here.
    // sepolia: {
    //   provider: () => new HDWalletProvider(process.env.MNEMONIC, process.env.SEPOLIA_RPC),
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
