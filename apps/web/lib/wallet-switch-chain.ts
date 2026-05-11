"use client";

import {getShieldedNetwork, type ShieldedChainId} from "./networks";
import {getActiveInjectedProvider, type InjectedProvider} from "./injected-wallet";

export function hexChainId(chainId: number): `0x${string}` {
  return `0x${chainId.toString(16)}` as `0x${string}`;
}

function addEthereumChainParams(net: NonNullable<ReturnType<typeof getShieldedNetwork>>) {
  return {
    chainId: hexChainId(net.id),
    chainName: net.label,
    nativeCurrency: {name: "Ether", symbol: "ETH", decimals: 18},
    rpcUrls: [net.rpcUrl],
    blockExplorerUrls: [net.explorerBaseUrl],
  };
}

function isChainNotAddedError(e: unknown): boolean {
  const c = typeof e === "object" && e && "code" in e ? (e as {code?: number | string}).code : undefined;
  return c === 4902 || c === "4902";
}

function isUserRejected(e: unknown): boolean {
  const c = typeof e === "object" && e && "code" in e ? (e as {code?: number | string}).code : undefined;
  return c === 4001 || c === "4001";
}

/** Ask the injected wallet (MetaMask, etc.) to switch to the chain used by the in-app pool network selector. */
export async function switchInjectedWalletToShieldedChain(shieldedChainId: ShieldedChainId): Promise<void> {
  const provider = getActiveInjectedProvider() as InjectedProvider | null;
  if (!provider) {
    throw new Error("No wallet found. Connect a wallet first.");
  }
  const net = getShieldedNetwork(shieldedChainId);
  if (!net) {
    throw new Error("That pool network is not available in this build.");
  }
  const params = [{chainId: hexChainId(net.id)}];
  try {
    await provider.request({method: "wallet_switchEthereumChain", params});
  } catch (e: unknown) {
    if (isUserRejected(e)) {
      throw new Error("Network switch was cancelled in the wallet.");
    }
    if (isChainNotAddedError(e)) {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [addEthereumChainParams(net)],
      });
      return;
    }
    throw e instanceof Error ? e : new Error(String(e));
  }
}

export async function readInjectedChainId(): Promise<number | null> {
  const provider = getActiveInjectedProvider() as InjectedProvider | null;
  if (!provider) return null;
  const hex = (await provider.request({method: "eth_chainId"})) as string;
  return Number(hex);
}
