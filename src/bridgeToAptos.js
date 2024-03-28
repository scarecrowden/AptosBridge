import {
    Wallet,
    Contract,
    solidityPacked,
    ZeroAddress,
    zeroPadValue,
    formatEther,
    formatUnits
} from "ethers";
import {minChainBalance, minStableBalance} from "./config.js";
import {
    approveToken,
    convertNativeForRefuel,
    getChainByWallet, getNativeBalance,
    random,
    randomFloat, sendTx, sleep,
    waitForBalance,
    withdraw
} from "../utils/common.js";
import {makeLogger} from "../utils/logger.js";
import {getAptosAccountFromPrivateKey} from "../utils/aptos.js";
import {APTOS_USDT_COIN} from "./constants.js";
const logger = makeLogger('bridgeToAptos')

export const shuffleArray = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }

    return arr;
};

export const getTokenBalance = async (wallet, { token }) => {
    while(true) {
        try {
            const tokenContract = new Contract(token.address, token.abi, wallet);
            return await tokenContract.balanceOf(wallet.address);
        } catch (error) {
            logger.error(`error, trying again ${error}`)
            await sleep(5)
        }
    }
};

export async function bridgeToAptos(evmKey, aptosKey, chain, stableToken, weiBalanceForWork, usdStableBalanceForWork) {
    const { provider } = chain;
    const evmWallet = new Wallet(evmKey, provider);

    const nativeBalance = await getNativeBalance(provider, evmWallet)

    if (formatEther(nativeBalance) < minChainBalance[chain.name]) {
        logger.info(`${evmWallet.address} withdrawing gas to ${chain.name}`)
        await withdraw(chain.nativeToken.ticker, chain.name, evmWallet.address, false)
        await waitForBalance(nativeBalance, provider, evmWallet)
    }

    let usdtBalance = usdStableBalanceForWork
    let weiBalance = weiBalanceForWork

    try {
        while (usdtBalance < minStableBalance) {
            const sleepTime = random(30, 100);
            logger.warn(`waiting for USDT bridge from APTOS/BINANCE -  ${sleepTime} seconds`)
            await sleep(sleepTime)

            weiBalance = await getTokenBalance(evmWallet, {
                token: stableToken,
            });
            usdtBalance = formatUnits(weiBalance, stableToken.decimals)
        }
    } catch (error) {
        logger.error(error)
        await sleep(5)
    }


    const aptosWallet = getAptosAccountFromPrivateKey(aptosKey);

    logger.info(`about to bridge ${usdtBalance} ${stableToken.ticker} from ${chain.name} -> APTOS`)
    await executeBridge(evmWallet, {
        toAddress: aptosWallet.address().toString(),
        token: stableToken,
        amount: weiBalance });
}

async function executeBridge(wallet, { toAddress, token, amount, destGas = 0.02 }) {
    let retries = 0
    while (true) {
        try {
            const fromChain = await getChainByWallet(wallet);
            const {
                contracts: {
                    services: { AptosBridge },
                },
            } = fromChain;

            const aptosBridgeContract = new Contract(
                AptosBridge.address,
                AptosBridge.abi,
                wallet
            );

            await approveToken(wallet, { amount, token, spender: AptosBridge.address, chain: fromChain });

            // const aptRefuelAmount = await convertNativeForRefuel({
            //     fromChain,
            //     toChain: chains.aptos,
            //     amount: parseEther(destGas.toString()),
            // });
            // const aptRefuelAmount = parseUnits('0.06', 8).toString()
            const aptRefuelAmount = 0

            // Adapter params to refuel APT
            const adapterParams = solidityPacked(
                ["uint16", "uint", "uint", "address"],
                [2, 10000, aptRefuelAmount, wallet.address]
            );

            const bridgeMethodParams = [
                token.address,
                zeroPadValue(toAddress, 32),
                amount,
                [wallet.address, ZeroAddress],
                adapterParams,
            ];
            let nativeFee = await aptosBridgeContract.quoteForSend(
                [wallet.address, ZeroAddress],
                adapterParams
            );

            const txParams = {
                data: aptosBridgeContract.interface.encodeFunctionData(
                    "sendToAptos",
                    bridgeMethodParams
                ),
                to: AptosBridge.address,
                value: nativeFee[0].toString(),
            };

            await sendTx(wallet, txParams, fromChain);
            logger.info(`bridge to aptos sucess`)

            return
        } catch (e) {
            retries += 1
            logger.error(`error occured while bridging from evm to aptos - ${e}`)
            if (retries === 5) {
                throw e
            }
            const sleepTime = random(30, 100);
            logger.info(`sleeping ${sleepTime} seconds`)
            await sleep(sleepTime)
        }
    }


}