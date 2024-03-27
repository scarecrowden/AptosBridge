import {bridgeToAptos, getTokenBalance, shuffleArray} from "./bridgeToAptos.js";
import {aptosBridgeChains, desiredVolumeConfig, sleepBetweenBridges, stableWithdrawAmount} from "./config.js";
import { makeLogger } from "../utils/logger.js";
import {
    isBalanceError,
    random,
    randomFloat,
    sleep,
    waitForBalance,
    waitForTransaction,
    withdraw
} from "../utils/common.js";
import { formatEther, Wallet, formatUnits } from "ethers";
import { bridgeFromAptos } from "./bridgeFromAptos.js";
import { Contract } from "ethers";
import { parseGwei } from "viem";
import { getAptosAccountFromPrivateKey } from "../utils/aptos.js";
import { PASS } from "./constants.js";
const logger = makeLogger('volume')

export async function makeVolume(evmKey, aptosKey, depositAddress) {
    let currentVolume = 0
    let balanceForWork;
    const desiredVolume = random(desiredVolumeConfig[0], desiredVolumeConfig[1])

    let chain = shuffleArray(aptosBridgeChains)[0];

    const { provider, stableCoin } = chain;
    const evmWallet = new Wallet(evmKey, provider);

    const tgMessages = [evmWallet.address]

    const sender =  getAptosAccountFromPrivateKey(aptosKey);

    logger.info(`evm: ${evmWallet.address} | deposit: ${depositAddress} | aptos: ${sender.address().toString()}`)

    const stableBalance = await getTokenBalance(evmWallet, {
        token: stableCoin,
    });
    const usdStableBalance = formatUnits(stableBalance, stableCoin.decimals)

    // withdraw USDT
    if (usdStableBalance < stableWithdrawAmount[0]) {
        while (true) {
            try {
                await withdraw(stableCoin.ticker, chain.name, evmWallet.address, true)
                const balanceForWork = await waitForBalance(stableBalance, provider, evmWallet, stableCoin)
                logger.info(`withdraw success, balance ${formatUnits(balanceForWork, stableCoin.decimals)}`)
                tgMessages.push(`${PASS} withdraw USDT from binance success, balance ${formatUnits(balanceForWork, stableCoin.decimals)}`)
                break
            } catch (e) {
                logger.error(`error occured while withdrawing ${e}`)
                const sleepTime = random(30, 60);
                logger.info(`sleep ${sleepTime} seconds and try again`)
                await sleep(sleepTime)
            }
        }
    }

    let sleepTime;

    logger.info(`${evmWallet.address} | need to do volume ${desiredVolume}$`)
    tgMessages.push(`will complete ${desiredVolume} USDT volume`)
    while (currentVolume < desiredVolume) {
        const { provider, stableCoin } = chain;
        const evmWallet = new Wallet(evmKey, provider);

        balanceForWork = await getTokenBalance(evmWallet, {
            token: stableCoin,
        });
        const usdStableBalanceForWork = formatUnits(balanceForWork, stableCoin.decimals)

        await bridgeToAptos(evmKey, aptosKey, chain, stableCoin, balanceForWork, usdStableBalanceForWork)
        tgMessages.push(`${PASS} bridge ${chain.name} -> APTOS`)

        sleepTime = random(sleepBetweenBridges[0], sleepBetweenBridges[1]);
        logger.info(`sleeping after bridge to aptos, ${sleepTime} seconds...`)
        await sleep(sleepTime)

        const destChain = await bridgeFromAptos(evmKey, aptosKey, stableCoin)
        tgMessages.push(`${PASS} bridge APTOS -> ${destChain.name}`)

        // TODO WAIT FOR BALANCE AFTER BRIDGE, AND NOT SECONDS
        sleepTime = random(sleepBetweenBridges[0], sleepBetweenBridges[1]);
        logger.info(`sleeping after bridge from aptos, ${sleepTime} seconds...`)
        await sleep(sleepTime)

        currentVolume += (parseInt(usdStableBalanceForWork) * 2)
        logger.info(`${evmWallet.address} | current volume is ${currentVolume}`)

        chain = destChain

    }

    await depositToCex(evmKey, depositAddress, chain);
    tgMessages.push(`${PASS} send to CEX - ${depositAddress}\nwallet completed ${currentVolume} USDT volume`)
    logger.info(`${evmWallet.address} | account completed`)

    return tgMessages
}

async function depositToCex(evmKey, depositAddress, chain) {
    let sleepTime;
    let retries = 0
    const { provider, stableCoin } = chain;
    const evmWallet = new Wallet(evmKey, provider);

    while (true) {
        try {
            let gasPrice = undefined;
            if (chain.name === 'BSC') {
                const randomBscGwei = randomFloat(1, 1.1).toString()
                gasPrice = parseGwei(randomBscGwei)
            }

            const stableBalance = await getTokenBalance(evmWallet, {
                token: stableCoin,
            });
            const usdStableBalance = parseInt(formatUnits(stableBalance, stableCoin.decimals))

            logger.info(`will send ${usdStableBalance} ${stableCoin.ticker}, from ${chain.name} -> ${depositAddress}`)

            const tokenContract = new Contract(stableCoin.address, stableCoin.abi, evmWallet);
            const res = await tokenContract.transfer(depositAddress, stableBalance, { gasPrice })
            logger.info(`Sent tx > ${chain.scan}${res.hash}`);

            await waitForTransaction(res.hash, provider)
            return
        } catch (e) {
            logger.error(e)

            if (isBalanceError(e)) {
                logger.warn(`native balance low, withdraw from binance`)
                const oldBalance = await provider.getBalance(evmWallet.address);

                await withdraw(chain.nativeToken.ticker, chain.name, evmWallet.address)
                const newBalance = await waitForBalance(oldBalance, provider, evmWallet)

                logger.info(`withdraw success, balance ${formatEther(newBalance)}`)
            }

            retries += 1
            if (retries === 3) {
                throw e
            }

            sleepTime = random(10, 30);
            logger.info(`try again after ${sleepTime} seconds`)
            await sleep(sleepTime)
        }
    }
}