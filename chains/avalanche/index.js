import { JsonRpcProvider } from "ethers";
import { AptosBridge } from "./aptosBridge";
import {USDT} from "./usdt/index.js";

const provider = new JsonRpcProvider("https://rpc.ankr.com/avalanche");

export const avalanche = {
  scan: "https://snowtrace.io/tx/",
  name: "Avalanche",
  provider,
  stableCoin: USDT,
  nativeToken: {
    ticker: "AVAX",
    coinGeckoId: "avalanche-2",
  },
  contracts: {
    tokens: {
      USDT,
    },
    services: {
      AptosBridge,
    },
  },
  chainId: 43114,
  lzChainId: 106,
};
