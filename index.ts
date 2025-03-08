import { BigNumber, ethers } from "ethers";
import { AlphaRouter, SwapType, SwapRoute } from "@uniswap/smart-order-router";
import { CurrencyAmount, TradeType } from "@uniswap/sdk-core";
import type { TransactionRequest } from "@ethersproject/abstract-provider";
import { getTokens } from "./token.js";
import {
  provider,
  signer,
  CHAIN_ID,
  SWAP_ROUTER_ADDRESS,
  SLIPPAGE_TOLERANCE,
  DEADLINE,
} from "./config.js";

// Create an async main function to wrap everything
async function main() {
  console.log("🔍 Looking for the newest WETH pool...");
  
  // Wait for the getTokens function to resolve
  const { Token0, Token1 } = await getTokens();

  // Ensure tokens are not null
  if (!Token0 || !Token1) {
    throw new Error("Tokens are not initialized");
  }

  console.log(`✅ Found pool with tokens:
  - Token0 (WETH): ${Token0.token.symbol} (${Token0.token.address})
  - Token1: ${Token1.token.symbol} (${Token1.token.address})`);

  const tokenFrom = Token0; // WETH (or any other token) as the input token
  const tokenFromContract = Token0.contract; // The contract instance of the input token
  const tokenTo = Token1.token; // USDC (or any other token) as the output token

  if (typeof process.argv[2] === "undefined") {
    throw new Error(`Pass in the amount of ${tokenFrom.token.symbol} to swap.`);
  }

  const walletAddress = await signer.getAddress();
  console.log(`👛 Using wallet: ${walletAddress}`);
  
  const amountIn = ethers.utils.parseUnits(process.argv[2], tokenFrom.token.decimals);
  console.log(`💰 Amount to swap: ${process.argv[2]} ${tokenFrom.token.symbol}`);
  
  const balance = await tokenFromContract.balanceOf(walletAddress);
  console.log(`💼 Current balance: ${ethers.utils.formatUnits(balance, tokenFrom.token.decimals)} ${tokenFrom.token.symbol}`);

  if (!(await Token0.walletHas(signer, amountIn))) {
    throw new Error(
      `Not enough ${tokenFrom.token.symbol}. Needs ${ethers.utils.formatUnits(amountIn, tokenFrom.token.decimals)}, but balance is ${ethers.utils.formatUnits(balance, tokenFrom.token.decimals)}.`
    );
  }

  console.log("🔄 Finding best swap route...");
  const router = new AlphaRouter({ chainId: CHAIN_ID, provider: provider });
  const route = await router.route(
    CurrencyAmount.fromRawAmount(tokenFrom.token, amountIn.toString()),
    tokenTo,
    TradeType.EXACT_INPUT,
    {
      recipient: walletAddress,
      slippageTolerance: SLIPPAGE_TOLERANCE,
      deadline: DEADLINE,
      type: SwapType.SWAP_ROUTER_02,
    }
  );

  if (!route) {
    throw new Error("No route found for the swap.");
  }

  console.log(
    `📊 Swap Details:
    - Input: ${ethers.utils.formatUnits(amountIn, tokenFrom.token.decimals)} ${tokenFrom.token.symbol}
    - Output: ${route.quote.toFixed(tokenTo.decimals)} ${tokenTo.symbol}
    - Route: ${route.route[0].tokenPath.map(t => t.symbol).join(" -> ")}`
  );

  const allowance: BigNumber = await tokenFromContract.allowance(
    walletAddress,
    SWAP_ROUTER_ADDRESS
  );

  console.log(`👆 Current allowance: ${ethers.utils.formatUnits(allowance, tokenFrom.token.decimals)} ${tokenFrom.token.symbol}`);

  const buildSwapTransaction = (
    walletAddress: string,
    routerAddress: string,
    route: SwapRoute
  ): TransactionRequest => {
    return {
      data: route.methodParameters?.calldata,
      to: routerAddress,
      from: walletAddress,
      value: BigNumber.from(route.methodParameters?.value),
      gasLimit: BigNumber.from("2000000"),
    };
  };

  const swapTransaction = buildSwapTransaction(
    walletAddress,
    SWAP_ROUTER_ADDRESS,
    route
  );

  const attemptSwapTransaction = async (
    signer: ethers.Wallet,
    transaction: TransactionRequest
  ) => {
    const signerBalance = await signer.getBalance();
    console.log(`⛽ Current ETH balance for gas: ${ethers.utils.formatEther(signerBalance)} ETH`);

    if (!signerBalance.gte(transaction.gasLimit || "0")) {
      throw new Error(`Not enough ETH to cover gas: ${transaction.gasLimit}`);
    }

    console.log("🚀 Sending swap transaction...");
    const tx = await signer.sendTransaction(transaction);
    console.log(`📝 Transaction sent: ${tx.hash}`);
    
    console.log("⏳ Waiting for confirmation...");
    const receipt = await tx.wait();
    console.log(`✅ Transaction confirmed! Hash: ${receipt.transactionHash}`);
  };

  if (allowance.lt(amountIn)) {
    console.log(`🔓 Requesting ${tokenFrom.token.symbol} approval...`);

    const approvalTx = await tokenFromContract
      .connect(signer)
      .approve(
        SWAP_ROUTER_ADDRESS,
        ethers.utils.parseUnits(amountIn.mul(1000).toString(), 18)
      );

    console.log("⏳ Waiting for approval transaction...");
    await approvalTx.wait(3);
    console.log("✅ Approval confirmed!");
    
    await attemptSwapTransaction(signer, swapTransaction);
  } else {
    console.log(
      `✅ Sufficient ${tokenFrom.token.symbol} allowance, proceeding with swap...`
    );
    await attemptSwapTransaction(signer, swapTransaction);
  }
}

// Run the main function
console.log("🤖 Base Sniper Bot Starting...");
main().catch((error) => {
  console.error("❌ Error:", error);
  process.exitCode = 1;
});
