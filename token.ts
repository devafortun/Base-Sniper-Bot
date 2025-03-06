import { Token } from "@uniswap/sdk-core";
import { Signer, BigNumber, BigNumberish, Contract, providers } from "ethers";
import { CHAIN_ID } from "./config";
import { provider } from "@ethersproject/providers";
import axios, { AxiosRequestConfig} from "axios";
import { config as loadEnvironmentVariables } from "dotenv";

loadEnvironmentVariables(); // Load environment variables from .env file

const ERC20_ABI = [
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
    "function allowance(address, address) external view returns (uint256)",
    "function approve(address, uint) external returns(bool)",
    "function balanceOf(address) external view returns(uint256)",
];