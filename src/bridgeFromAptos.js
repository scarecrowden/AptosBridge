import {shuffleArray} from "./bridgeToAptos.js";
import Web3 from 'web3';
import {AptosClient} from "aptos";
import {getAptosAccountFromPrivateKey} from "../utils/aptos.js";
import {getAptosCoinBalance, random, sleep, withdraw} from "../utils/common.js";
import {makeLogger} from "../utils/logger.js";
import {ethers, formatUnits} from "ethers";
import {APTOS_NATIVE_COIN, APTOS_USDT_COIN} from "./constants.js";
import {aptosBridgeChains, minChainBalance, minStableBalance, stableWithdrawAmount} from "./config.js";

const logger = makeLogger('bridgeFromAptos')



export const getNonceAptos = async(privateKey) => {
    const client = new AptosClient('https://rpc.ankr.com/http/aptos/v1');
    const sender =  getAptosAccountFromPrivateKey(privateKey);
    return (await client.getAccount(sender.address())).sequence_number;
}

export async function bridgeFromAptos(evmKey, aptosKey, stableToken) {
    let aptosResource;
    let aptosBalance;
    let newAptosBalance;
    let destChain = shuffleArray(aptosBridgeChains)[0];

    const { provider } = destChain
    const evmWallet = new ethers.Wallet(evmKey, provider);

    const client = new AptosClient('https://rpc.ankr.com/http/aptos/v1');
    const sender =  getAptosAccountFromPrivateKey(aptosKey);

    aptosBalance = await getAptosCoinBalance(client, sender, APTOS_NATIVE_COIN)

    if (formatUnits(aptosBalance, 8) < minChainBalance['Aptos']) {
        logger.info(`${sender.address().toString()} withdrawing gas to APT`)
        await withdraw('APT', 'Aptos', sender.address().toString(), false, 'okx')

        while (true) {
            try {
                newAptosBalance = await getAptosCoinBalance(client, sender, APTOS_NATIVE_COIN)
                if (newAptosBalance !== aptosBalance) {
                    logger.warn(`received withdraw, new balance is: ${formatUnits(newAptosBalance, 8)} APT`)
                    break
                }
                const sleepTime = random(30, 100);
                logger.warn(`waiting for withdraw of APT from okx -  ${sleepTime} seconds`)
                await sleep(sleepTime)
            } catch (e) {
                logger.error(`error - ${e}, try again in 10 sec...`)
                await sleep(10)
            }

        }
    }

    let usdtBalance = await getAptosCoinBalance(client, sender, APTOS_USDT_COIN)

    while (parseFloat(formatUnits(usdtBalance, 6)) < minStableBalance) {
        const sleepTime = random(30, 100);
        logger.warn(`waiting for USDT bridge from EVM -  ${sleepTime} seconds`)
        await sleep(sleepTime)

        usdtBalance = await getAptosCoinBalance(client, sender, APTOS_USDT_COIN)
    }

    const w3 = new Web3();

    logger.info(`${sender.address()} | about to bridge ${formatUnits(usdtBalance, 6)} ${stableToken.ticker} -> ${destChain.name}`)

    let retries = 0;
    let sleepTime;
    let fee = "11000000";
    while (true) {
        try {
            await sendTransactionAptos({
                "function": "0xf22bede237a07e121b56d91a491eb7bcdfd1f5907926a9e58338f964a01b17fa::coin_bridge::send_coin_from",
                "type_arguments": [
                    "0xf22bede237a07e121b56d91a491eb7bcdfd1f5907926a9e58338f964a01b17fa::asset::USDT"
                ],
                "arguments": [
                    destChain.lzChainId,
                    Buffer.from(w3.utils.hexToBytes(ethers.zeroPadValue(evmWallet.address, 32))),
                    usdtBalance,
                    fee,
                    "0",
                    false,
                    Buffer.from(w3.utils.hexToBytes('0x000100000000000249f0')),
                    Buffer.from('0x', 'hex')
                ],
                "type": "entry_function_payload"
            }, aptosKey);
            return destChain
        } catch (err) {
            logger.error(`${sender.address()} | error occurred while bridging from aptos - ${err}`)
            retries += 1
            if (retries === 3) {
                throw err
            }

            destChain = shuffleArray(aptosBridgeChains)[0];

            sleepTime = random(10, 100);
            logger.info(`sleeping and trying again with other random dest chain - ${sleepTime} seconds....`)
            await sleep(sleepTime)
            fee += '1100000'
        }
    }


}

async function sendTransactionAptos(payload, privateKey, gasLimit = 12000) {
    const client = new AptosClient('https://rpc.ankr.com/http/aptos/v1');
    const sender =  getAptosAccountFromPrivateKey(privateKey);
    let sleepTime;

    let retries = 0
    const nonce = await getNonceAptos(privateKey)
    const txnRequest = await client.generateTransaction(sender.address(), payload, {
        gas_unit_price: 100,
        max_gas_amount: gasLimit,
        sequence_number: nonce
    });

    const signedTxn = await client.signTransaction(sender, txnRequest);
    const transactionRes = await client.submitTransaction(signedTxn);

    await client.waitForTransactionWithResult(transactionRes.hash, { checkSuccess: true }).then(async(hash) => {
        console.log(`${sender.address()} | Send TX in Aptos: https://explorer.aptoslabs.com/txn/${hash.hash}`)
    });

    logger.info(`${sender.address()} | bridge from aptos success`)
}