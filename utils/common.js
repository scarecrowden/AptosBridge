import {stableWithdrawAmount, withdrawConfig} from "../src/config.js";
import {Binance} from "../exchanges/binance.js";
import {makeLogger} from "./logger.js";
import {chains} from "../chains/index.js";
import BigNumber from "bignumber.js";
import {Contract, formatEther, formatUnits, parseEther, parseUnits} from "ethers";
import {APPROVAL_AMOUNT_MULTIPLIER} from "../src/constants.js";
import axios from "axios";
import {getTokenBalance} from "../src/bridgeToAptos.js";
import { parseGwei } from "viem"
import {aptos} from "../chains/aptos/index.js";
import {OKX} from "../exchanges/okx.js";
const logger = makeLogger('utils')

export function random(min, max) {
    min = Math.ceil(min)
    max = Math.floor(max)
    return Math.floor(Math.random() * (max - min + 1) + min)
}

export function randomFloat(min, max) {
    return Math.random() * (max - min) + min;
}

export const sleep = async (seconds) => new Promise(resolve => setTimeout(resolve, seconds * 1000))


export async function withdraw(coin, network, address, stableCoin = false, exchange = 'binance'){
    let withdrawRange = stableCoin ? stableWithdrawAmount : withdrawConfig[network].sum
    let sum = randomFloat(withdrawRange[0], withdrawRange[1])

    const tokenPrice = await getCurrentPrice(coin)
    const tokenCount = sum / tokenPrice

    if (exchange === 'binance') {
        const binance = new Binance()
        await binance.withdraw(address, network, coin, tokenCount.toString())
    } else {
        const okx = new OKX()
        await okx.withdraw(address, aptos.name, aptos.nativeToken.ticker, tokenCount.toString())
    }
}

export async function getNativeBalance(provider, evmWallet) {
    while(true) {
        try {
            return await provider.getBalance(evmWallet.address);
        } catch (error) {
            logger.error(`error getting balanace trying again - ${error}`)
            await sleep(5)
        }
    }
}

export async function waitForBalance(oldBalance, provider, evmWallet, token = undefined){
    let newBalance
    if (token) {
        newBalance = await getTokenBalance(evmWallet, {
            token: token,
        });
    } else {
        newBalance = await getNativeBalance(provider, evmWallet)
    }

    while (newBalance === oldBalance) {
        logger.info(`waiting for withdraw, current balance: ${formatEther(newBalance)}`)
        const sleepTime = random(30, 100);
        await sleep(sleepTime)
        if (token) {
            newBalance = await getTokenBalance(evmWallet, {
                token: token,
            });
        } else {
            newBalance = await getNativeBalance(provider, evmWallet)
        }
    }
    return newBalance
}

export const getChainByWallet = async (wallet) => {
    const { chainId } = await wallet.provider.getNetwork();
    return getChainById(chainId);
};

export const getChainById = (id) => {
    return Object.values(chains).find((chain) => chain.chainId === Number(id));
};


export const approveToken = async (wallet, { amount, token, spender, chain }) => {
    const bnAmount = new BigNumber(amount);

    const tokenContract = new Contract(token.address, token.abi, wallet);

    const allowance = await tokenContract.allowance(wallet.address, spender);
    if (bnAmount.gt(allowance)) {
        while (true) {
            try {
                const humanAmount = formatUnits(amount.toString(), token.decimals)
                const randomMultiplier = randomFloat(1, APPROVAL_AMOUNT_MULTIPLIER)
                const approveAmount = humanAmount * randomMultiplier

                logger.info(`Approving ${approveAmount} ${token.ticker}...`)

                let feeData = await wallet.provider.getFeeData();
                let fee = feeData.gasPrice
                if (chain.name === 'BSC') {
                    const randomBscGwei = randomFloat(1, 1.1).toString()
                    fee = parseGwei(randomBscGwei)
                }

                const tx = await tokenContract.approve(
                    spender,
                    parseUnits(approveAmount.toFixed(6).toString(), token.decimals).toString(),
                    {
                        gasPrice: fee,
                    }
                );
                await wallet.provider.waitForTransaction(tx.hash, undefined, 120 * 1000);
                logger.info(`Approve success...`)
                return
            } catch (e) {
                const sleepTime = random(5, 10);
                logger.error(`error ${e} while approving token, trying again in ${sleepTime} seconds`)
                await sleep(sleepTime)
            }
        }
    }
};

export async function getCurrentPrice(symbol = 'ETH') {
    return await axios.get(`https://min-api.cryptocompare.com/data/price?fsym=${symbol}&tsyms=USD`).then(response => {
        return response.data.USD
    });
}

export function isBalanceError(error) {
    return error.toString().includes('insufficient funds') ||
        error.toString().includes('exceeds the balance') ||
        error.toString().includes('Not enough balance') ||
        error.toString().includes('gas required exceeds allowance') ||
        error.toString().includes('insufficient balance') ||
        error.toString().includes('Execution reverted for an unknown reason');
}

export const convertNativeForRefuel = async ({ fromChain, toChain, amount }) => {
    const { nativeToken: fromNativeToken } = fromChain;
    const { nativeToken: toNativeToken } = toChain;

    const fromNativeTokenPrice = await getCurrentPrice(fromNativeToken.ticker)
    const toNativeTokenPrice = await getCurrentPrice(toNativeToken.ticker)


    return new BigNumber(amount)
        .dividedBy(10 ** 18)
        .multipliedBy(fromNativeTokenPrice)
        .dividedBy(toNativeTokenPrice)
        .multipliedBy(10 ** 18)
        .integerValue(BigNumber.ROUND_FLOOR)
        .toString();
};

export const sendTx = async (wallet, txData, chain, gasParams) => {
    let populatedTx;

    try {
        if (gasParams) {
            throw new Error();
        }

        let feeData = await wallet.provider.getFeeData();
        feeData = feeData.gasPrice
        if (chain.name === 'BSC') {
            const randomBscGwei = randomFloat(1, 1.1).toString()
            feeData = parseGwei(randomBscGwei)
        }

        populatedTx = await wallet.populateTransaction({
            ...txData,
            gasPrice: feeData,
        });
    } catch(e) {
        logger.error(e)
        populatedTx = await wallet.populateTransaction({
            ...txData,
            ...(gasParams || {}),
        });
    }
    const tx = await wallet.sendTransaction(populatedTx);
    logger.info(`Sent tx > ${chain.scan}${tx.hash}`);

    await waitForTransaction(tx.hash, wallet.provider)
};

export async function waitForTransaction (hash, provider) {
    const res = await provider.waitForTransaction(hash, undefined, 120 * 1000);
    if (res && res.status === 1) {
        console.log({
            message: 'The transaction is fully confirmed in the blockchain',
        });
        return true;
    } else {
        console.log({
            message: 'Transaction reverted. ',
        });

        throw new Error('Transaction reverted. ')
    }
}