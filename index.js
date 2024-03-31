import {makeVolume} from "./src/volume.js";
import fs from "fs";
import {random, sleep} from "./utils/common.js";
import {makeLogger} from "./utils/logger.js";
import {sleepBetweenAccounts, TG_ID, TG_TOKEN} from "./src/config.js";
import { Telegraf } from 'telegraf'
const logger = makeLogger('index')
function shuffle(array) {
    let currentIndex = array.length,  randomIndex
    while (currentIndex > 0) {
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
        [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]]
    }

    return array
}

function readWallets(filePath) {
    try {
        const fileContent = fs.readFileSync(filePath, 'utf-8')
        return fileContent.split('\n').map(line => line.trim()).filter(line => line !== '')
    } catch (error) {
        console.error('Error reading the file:', error.message)
        return []
    }
}

function createWalletsMapping(evmPrivateKeys, aptosPrivateKeys, depositAddresses) {
    const mapping = {}
    for (let [index, privateKey] of evmPrivateKeys.entries()) {
        mapping[privateKey] = {
            aptosPrivateKey: aptosPrivateKeys[index],
            depositAddress: depositAddresses[index],
        }
    }

    return mapping;
}

function removeAccountFromFile(account, filePath) {
    let newRecipients = [];
    let data;

    try {
        data = fs.readFileSync(filePath, 'utf8')
    } catch(error) {
        logger.error(`error reading from file ${error}`)
        return;
    }

    // Split data into lines
    const lines = data.split('\n');

    // Process each line
    lines.forEach(line => {
        if (line.includes(account)) {
            line = line.replace(account, "");
        }
        newRecipients.push(line);
    });

    // Write back to the file
    try {
        fs.writeFileSync(filePath, newRecipients.join('\n'), 'utf8');
    } catch (err) {
        logger.error("Error writing to file:", err);
    }
}


const main = async () => {
    const bot = new Telegraf(TG_TOKEN)
    let evmPrivateKeys = readWallets('./data/evm_private_keys.txt')
    let aptosPrivateKeys = readWallets('./data/aptos_private_keys.txt')
    let depositAddresses = readWallets('./data/deposit_addresses.txt')

    const walletsMapping = createWalletsMapping(evmPrivateKeys, aptosPrivateKeys, depositAddresses)

    shuffle(evmPrivateKeys)
    for (let privateKey of evmPrivateKeys) {
        const tgMessages = await makeVolume(privateKey, walletsMapping[privateKey].aptosPrivateKey, walletsMapping[privateKey].depositAddress)

        const strMessagesToSend = tgMessages.join('\n')
        if (TG_ID !== -1) {
            try {
                await bot.telegram.sendMessage(TG_ID, strMessagesToSend)
            } catch (error) {
                logger.error(`failed sending tg message ${error}`)
            }
        }

        removeAccountFromFile(privateKey,  "./data/evm_private_keys.txt")
        removeAccountFromFile(walletsMapping[privateKey].aptosPrivateKey,  "./data/aptos_private_keys.txt")
        removeAccountFromFile(walletsMapping[privateKey].depositAddress,  "./data/deposit_addresses.txt")

        const sleepTime = random(sleepBetweenAccounts[0], sleepBetweenAccounts[1]);
        logger.info(`sleep ${sleepTime} seconds and continue to next account`)
        await sleep(sleepTime)
    }
};

main()
    .then(r => console.log('completed run'))
    .catch(e => console.error(`unexpected error ${e}`))
