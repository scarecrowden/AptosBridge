import axios from 'axios'
import crypto from 'crypto'
import ccxt from 'ccxt'
import { HttpsProxyAgent } from 'https-proxy-agent'
import {okxConfig} from "../src/config.js";
import {makeLogger} from "../utils/logger.js";

export class OKX {
    baseUrl = 'https://www.okx.com'
    endpoint = '/api/v5/asset/withdrawal'
    logger
    exchange

    constructor() {
        this.logger = makeLogger("OKX")
        this.exchange = new ccxt.okx({
            apiKey: okxConfig.key,
            secret: okxConfig.secret,
            password: okxConfig.passphrase,
            enableRateLimit: true,
        })
    }

    async getWithdrawalFee(symbolWithdraw, chainName) {
        try {
            const currencies = await this.exchange.fetchCurrencies()
            const currencyInfo = currencies[symbolWithdraw]
            if (currencyInfo) {
                const networkInfo = currencyInfo.networks
                if (networkInfo && networkInfo[chainName]) {
                    const withdrawalFee = networkInfo[chainName].fee
                    return withdrawalFee === 0 ? 0 : withdrawalFee
                }
            }
        } catch (error) {
            this.logger.error('Error:', error.toString())
        }
    }

    async withdraw(address, network = 'Aptos', coin = 'APT', amount) {
        const timestamp = new Date().toISOString()
        const method = 'POST'
        let fee;

        switch (network) {
            case 'Aptos':
                fee = 0.001
                break
        }

        this.logger.info(`${address} | OKX withdraw ${coin} -> ${network}: ${parseFloat(amount).toFixed(5)} ${coin}`)

        const body = {
            ccy: coin,
            amt: amount,
            dest: '4',
            toAddr: address,
            chain: `${coin}-${network}`,
            walletType: 'private',
            fee: fee
        }

        const preHash = timestamp + method + this.endpoint + JSON.stringify(body)
        const signature = crypto.createHmac('sha256', okxConfig.secret).update(preHash).digest('base64')

        let agent = null

        if (okxConfig.proxy) {
            agent = new HttpsProxyAgent(okxConfig.proxy)
        }

        try {
            const response = await axios.post(this.baseUrl + this.endpoint, body, {
                httpsAgent: agent,
                headers: {
                    'OK-ACCESS-KEY': okxConfig.key,
                    'OK-ACCESS-SIGN': signature,
                    'OK-ACCESS-TIMESTAMP': timestamp,
                    'OK-ACCESS-PASSPHRASE': okxConfig.passphrase,
                    'Content-Type': 'application/json'
                }
            })

            if (response.data.code) {
                if (response.data.code === '0') {
                    this.logger.info(`${address} | OKX withdraw success`)
                } else {
                    this.logger.info(`${address} | OKX withdraw unsuccessful: ${response.data.msg}`)
                }
            }
        } catch (e) {
            if (e.response) {
                this.logger.info(`${address} | OKX withdraw error: ${e.response.data.msg}`)
            } else {
                this.logger.info(`${address} | OKX withdraw error: ${e}`)
            }
            throw e
        }
    }
}