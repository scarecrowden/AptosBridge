import {bsc} from "../chains/bsc/index.js";
import {avalanche} from "../chains/avalanche/index.js";

// in $ value
export const withdrawConfig = {
    'BSC': {
        sum: [1.5, 2],
        cex: 'binance'
    },
    'Avalanche': {
        sum: [1.3, 2],
        cex: 'binance'
    },
    'Aptos': {
        sum: [1.5, 2],
        cex: 'okx'
    },
}

export const aptosBridgeChains = [bsc, avalanche]

export const sleepBetweenAccounts = [10, 100]
export const sleepBetweenBridges = [120, 240]

export const minChainBalance = {
    'BSC': 0.00205,
    'Avalanche': 0.02,
    'Aptos': 0.11
}

export const binanceConfig = {
    key: '',
    secret: '',
    proxy: ''
}

export const okxConfig = {
    key: '',
    secret: '',
    passphrase: '',
    proxy: ''
}

export const desiredVolumeConfig = [2000, 4000]
export const stableWithdrawAmount = [1001, 2001]
export const minStableBalance = 500

export const TG_TOKEN = ''
export const TG_ID = -1
