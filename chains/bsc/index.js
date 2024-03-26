import { JsonRpcProvider } from "ethers";

import { USDT } from "./usdt";
import { AptosBridge } from "./aptosBridge";

const provider = new JsonRpcProvider("https://rpc.ankr.com/bsc");

export const bsc = {
  scan: "https://bscscan.com/tx/",
  name: "BSC",
  provider,
  stableCoin: USDT,
  nativeToken: {
    ticker: "BNB",
    coinGeckoId: "binancecoin",
    decimals: 18,
  },
  contracts: {
    tokens: {
      USDT,
    },
    services: {
      AptosBridge,
    },
  },
  chainId: 56,
  lzChainId: 102,
};
