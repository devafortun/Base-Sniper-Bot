import { Token } from "@uniswap/sdk-core";
import { Signer, BigNumber, BigNumberish, Contract, providers } from "ethers";
import { CHAIN_ID } from "./config.js";
import { Provider } from "@ethersproject/providers";
import axios, { AxiosRequestConfig } from "axios";
import { config as loadEnvironmentVariables } from "dotenv";
import { Network } from "inspector/promises";
import { time } from "console";

loadEnvironmentVariables(); // Load environment variables from .env file

const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function allowance(address, address) external view returns (uint256)",
  "function approve(address, uint) external returns(bool)",
  "function balanceOf(address) external view returns(uint256)",
];

//We are going to need Token Contract to call different functions like balanceOf, decimals and symbol. So we are building Token Contract using buildERC20TokenWithContract function by providing the token address and the provider.

type TokenWithContract = {
  contract: Contract;
  walletHas: (Signer: Signer, requredAmount: BigNumberish) => Promise<boolean>;
  token: Token;
};

const buildERC20TokenWithContract = async (
  address: string,
  provider: Provider
): Promise<TokenWithContract | null> => {
  try {
    const contract = new Contract(address, ERC20_ABI, provider);

    const [name, symbol, decimals] = await Promise.all([
      contract.name(),
      contract.symbol(),
      contract.decimals(),
    ]);

    return {
      contract: contract,

      walletHas: async (signer, requiredAmount) => {
        const signerBalance = await contract
          .connect(signer)
          .balanceOf(await signer.getAddress());

        return signerBalance.gte(BigNumber.from(requiredAmount));
      },

      token: new Token(CHAIN_ID, address, decimals, symbol, name),
    };
  } catch (error) {
    console.error(
      `Failed to build ERC20 token with contract at address ${address}:`,
      error
    );
    return null;
  }
};

//Setting provider and type of Tokens here as we are using Typescript. Then we built a function getTokens which makes an API call and gets the address of Tokens 0 and 1 in the latest created liquidity pool. This function finally returns the Token Contract for the fetched Token 0 and Token 1 addresses using buildERC20TokenWithContract. Keep in mind we have set the Token 0 address as WETH token address. In the index.ts file we are going to swap this WETH with the other token i.e token 1 in the pool.

//Example usage for BASE
const provider = new providers.JsonRpcBatchProvider(process.env.RPC);

type Tokens = {
  Token0: TokenWithContract | null;
  Token1: TokenWithContract | null;
};

export const getTokens = async (): Promise<Tokens> => {
  try {
    let data = JSON.stringify({
      query:
        'query {\n  EVM(network: base) {\n    Events(\n      limit: {count: 1}\n      orderBy: {descending: Block_Time}\n      where: {Log: {Signature: {Name: {is: "PoolCreated"}}, SmartContract: {is: "0x33128a8fC17869897dcE68Ed026d694621f6FDfD"}}, Arguments: {startsWith: {Value: {Address: {is: "0x4200000000000000000000000000000000000006"}}}}}\n    ) {\n      Transaction {\n        Hash\n      }\n      Block {\n        Time\n      }\n      Log {\n        Signature {\n          Name\n        }\n      }\n      Arguments {\n        Name\n        Type\n        Value {\n          ... on EVM_ABI_Integer_Value_Arg {\n            integer\n          }\n          ... on EVM_ABI_String_Value_Arg {\n            string\n          }\n          ... on EVM_ABI_Address_Value_Arg {\n            address\n          }\n          ... on EVM_ABI_BigInt_Value_Arg {\n            bigInteger\n          }\n          ... on EVM_ABI_Bytes_Value_Arg {\n            hex\n          }\n          ... on EVM_ABI_Boolean_Value_Arg {\n            bool\n          }\n        }\n      }\n    }\n  }\n}\n',
      variables: "{}",
    });
    const axiosConfig: AxiosRequestConfig = {
      method: "post",
      maxBodyLength: Infinity,
      url: "https://streaming.bitquery.io/eap",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.BITQUERY_TOKEN}`,
      },
      data: data,
    };

    const response = await axios.request(axiosConfig);

    const Token0Address =
      response.data.data.EVM.Events[0].Arguments[0].Value.address;
    const Token1Address =
      response.data.data.EVM.Events[0].Arguments[1].Value.address;
    console.log(Token0Address);
    console.log(Token1Address);

    const Token0 = await buildERC20TokenWithContract(Token0Address, provider);
    const Token1 = await buildERC20TokenWithContract(Token1Address, provider);

    return {
      Token0,
      Token1,
    };
  } catch (error) {
    console.error("Error fetching tokens:", error);
    return { Token0: null, Token1: null };
  }
};
