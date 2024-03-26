import axios from 'axios'
import crypto from 'crypto'
import { makeLogger } from '../utils/logger.js'
import { HttpsProxyAgent } from "https-proxy-agent"
import {randomFloat} from "../utils/common.js";
import {binanceConfig} from "../src/config.js";
import ccxt from 'ccxt'

export class Binance {
    binanceEndpoint = 'https://api.binance.com/sapi/v1/capital/withdraw/apply'
    logger

    constructor() {
        this.logger = makeLogger("Binance")
    }

    async transferFromSubAccounts() {
        const exchange = new ccxt.binance ({
            'apiKey': binanceConfig.key,
            'secret': binanceConfig.secret,
        })

        const res = await exchange.sapiGetSubAccountList()
        const subAccounts = res['subAccounts']

        for (const account of subAccounts) {
            const accountEmail = account['email']
            const subAccountAssets = await exchange.sapiV4GetSubAccountAssets({ 'email': accountEmail })
            const subAccountBalances = subAccountAssets['balances']

            let usdtBalance = 0;
            for (const balance of subAccountBalances) {
                if (balance['asset'] === 'USDT') {
                    usdtBalance = parseInt(balance['free'])
                    break
                }
            }

            if (usdtBalance === 0) {
                continue
            }

            await exchange.sapiPostSubAccountUniversalTransfer({
                'fromEmail': accountEmail,
                'fromAccountType': 'SPOT',
                'toAccountType': 'SPOT',
                'asset': 'USDT',
                'amount': usdtBalance
            })
        }
    }

    async withdraw(address, network, coin, amount) {
        await this.transferFromSubAccounts()
        switch (network) {
            case 'Avalanche':
                network = 'AVAXC'
                break
        }

        const timestamp = Date.now()
        const queryString = `timestamp=${timestamp}&coin=${coin}&network=${network}&address=${address}&amount=${parseFloat(amount).toFixed(5)}`
        const signature = crypto.createHmac('sha256', binanceConfig.secret).update(queryString).digest('hex')
        const queryParams = `?${queryString}&signature=${signature}`

        let realAmount = parseFloat(amount)
        if (network === 'BSC' && realAmount <= 0.0046) {
            realAmount = randomFloat(0.005, 0.0051)
        }
        
        this.logger.info(`${address} | Binance withdraw ${coin} -> ${network}: ${realAmount.toFixed(5)} ${coin}`)

        let agent = null

        if (binanceConfig.proxy) {
            agent = new HttpsProxyAgent(binanceConfig.proxy)
        }

        await axios.post(this.binanceEndpoint+queryParams, {
            httpsAgent: agent,
            coin: coin,
            network: network,
            address: address,
            amount: realAmount.toFixed(5)
        }, {
            headers: {
                'X-MBX-APIKEY': binanceConfig.key
            }
        }).then(response => {
            this.logger.info(`${address} | Binance withdraw success`)
        }).catch(e => {
            if (e.response) {
                this.logger.info(`${address} | Binance withdraw error: ${e.response.data.msg}`)
            } else {
                this.logger.info(`${address} | Binance withdraw error: ${e.toString()}`)
            }
            throw e
        })
    }
}