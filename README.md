# AptosBridge
_Bridge From BSC/AVAXC <-> APTOS using AptosBridge_

## Install
`npm install`

## Start
1. fill aptos private keys in `data/aptos_private_keys.txt`
2. fill evm private keys in `data/evm_private_keys.txt`
3. fill binance deposit addresses in `data/deposit_addresses.txt`

`npm start`

## Logic
1. Withdraws `USDT -> AVAX\BSC` (configure in `config.js` which chains to use)
2. If chain `balance < minChainBalance`, withdraw gas from binance (for evm) and okx (for aptos) as per `withdrawConfig`
3. Bridge `USDT` between `APTOS <-> BSC/AVAXC` untill reaches random `desiredVolumeConfig`
4. Send funds back to Binance deposit address
5. start again