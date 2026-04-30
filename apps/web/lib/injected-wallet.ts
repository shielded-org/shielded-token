"use client";

export type InjectedProvider = {
  isMetaMask?: boolean;
  isPhantom?: boolean;
  request: (args: {method: string; params?: unknown[]}) => Promise<unknown>;
};

declare global {
  interface Window {
    ethereum?: InjectedProvider & {providers?: InjectedProvider[]};
    __shieldedActiveProvider?: InjectedProvider;
  }
}

export function listInjectedProviders() {
  if (typeof window === "undefined" || !window.ethereum) return [];
  const candidates = window.ethereum.providers?.length ? window.ethereum.providers : [window.ethereum];
  const dedup = new Map<string, InjectedProvider>();
  for (const provider of candidates) {
    const name = provider.isMetaMask ? "MetaMask" : provider.isPhantom ? "Phantom" : "Injected Wallet";
    if (!dedup.has(name)) dedup.set(name, provider);
  }
  return Array.from(dedup.entries()).map(([name, provider]) => ({name, provider}));
}

export function setActiveInjectedProvider(provider: InjectedProvider) {
  if (typeof window !== "undefined") {
    window.__shieldedActiveProvider = provider;
  }
}

export function getActiveInjectedProvider() {
  if (typeof window === "undefined") return null;
  return window.__shieldedActiveProvider ?? window.ethereum ?? null;
}
