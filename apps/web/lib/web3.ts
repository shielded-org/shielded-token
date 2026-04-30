"use client";

import {ethers} from "ethers";
import {getActiveInjectedProvider} from "./injected-wallet";

export async function getBrowserSigner(expectedAddress?: string) {
  const activeProvider = getActiveInjectedProvider();
  if (!activeProvider) {
    throw new Error("No injected wallet provider found.");
  }
  const provider = new ethers.BrowserProvider(activeProvider as unknown as ethers.Eip1193Provider);
  const signer = await provider.getSigner();
  if (expectedAddress && signer.address.toLowerCase() !== expectedAddress.toLowerCase()) {
    throw new Error("Connected signer does not match selected wallet address.");
  }
  return signer;
}
