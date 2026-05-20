"use client";

import Link from "next/link";
import {usePathname} from "next/navigation";
import {AlertCircle, Droplets, House, Info, Menu, Settings, Shield, TerminalSquare, X} from "lucide-react";
import {ethers} from "ethers";
import {useCallback, useEffect, useRef, useState} from "react";
import {WalletConnection} from "@/components/wallet/wallet-connection";
import {WalletNetworkSyncBanner} from "@/components/wallet/wallet-network-sync-banner";
import {NAV_ITEMS, RELAYER_URL} from "@/lib/constants";
import {
  deriveShieldedKeysFromWallet,
  liveDecryptedNotesToStored,
  mapNotesToUi,
  resolveNoteStates,
  scanPrivateState,
  shieldedScanCacheKey,
  storedDecryptedNotesToLive,
  type ResolvedNoteState,
  type ShieldedScanCachePayload,
} from "@/lib/shielded-integration";
import {
  buildTokenDefinitionsForShieldedNetwork,
  getShieldedNetwork,
  getShieldedNetworks,
  normalizeStoredShieldedChainId,
  type ShieldedChainId,
} from "@/lib/networks";
import {getWorkingReadProvider} from "@/lib/rpc-read";
import {deriveOwnerPk, validateStoredViewingKeyPair} from "@/lib/keys";
import {shieldedScanDebug, shieldedScanDebugEnabled} from "@/lib/shielded-scan-debug";
import {ERC20_ABI, POSEIDON_ABI} from "@/lib/shielded-config";
import {cn} from "@/lib/utils";
import {getActiveInjectedProvider} from "@/lib/injected-wallet";
import {readInjectedChainId, switchInjectedWalletToShieldedChain} from "@/lib/wallet-switch-chain";
import {useShieldedStore} from "@/store/use-shielded-store";

export function AppShell({children}: {children: React.ReactNode}) {
  const pathname = usePathname();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [persistHydrated, setPersistHydrated] = useState(() => useShieldedStore.persist.hasHydrated());
  const address = useShieldedStore((state) => state.walletAddress);
  const keyMaterialAddress = useShieldedStore((state) => state.keyMaterialAddress);
  const viewingPub = useShieldedStore((state) => state.viewingPub);
  const viewingKey = useShieldedStore((state) => state.viewingKey);
  const spendingKey = useShieldedStore((state) => state.spendingKey);
  const ownerPk = useShieldedStore((state) => state.ownerPk);
  const tokens = useShieldedStore((state) => state.tokens);
  const lastSyncedBlock = useShieldedStore((state) => state.lastSyncedBlock);
  const setRelayerHealth = useShieldedStore((state) => state.setRelayerHealth);
  const setKeyMaterial = useShieldedStore((state) => state.setKeyMaterial);
  const setNotes = useShieldedStore((state) => state.setNotes);
  const setOwnerPk = useShieldedStore((state) => state.setOwnerPk);
  const setTokens = useShieldedStore((state) => state.setTokens);
  const shieldedRpcChainId = useShieldedStore((state) => state.shieldedRpcChainId);
  const setShieldedRpcChainId = useShieldedStore((state) => state.setShieldedRpcChainId);
  const setWalletConnection = useShieldedStore((state) => state.setWalletConnection);

  const onPoolNetworkChange = useCallback(
    (nextId: ShieldedChainId) => {
      setShieldedRpcChainId(nextId);
      const addr = useShieldedStore.getState().walletAddress;
      if (!addr || !getActiveInjectedProvider()) return;
      void (async () => {
        try {
          await switchInjectedWalletToShieldedChain(nextId);
          const cid = await readInjectedChainId();
          if (cid != null) {
            setWalletConnection(addr, cid);
          }
        } catch {
          /* User may reject; WalletNetworkSyncBanner stays for manual switch. */
        }
      })();
    },
    [setShieldedRpcChainId, setWalletConnection]
  );

  /** Per-pool-chain last resolved scan for token metadata re-map (prevents another chain’s completion from stealing this slot). */
  const lastResolvedScanByChainRef = useRef<Partial<Record<ShieldedChainId, ResolvedNoteState[]>>>({});
  /**
   * Bumped only when the `syncNotes` effect re-runs (pool network / keys / hydration change).
   * Do **not** bump on every `syncNotes()` call: the 30s interval + slow L2 cold scans (e.g. Arbitrum
   * from deploy block) otherwise incremented a per-invocation seq and discarded valid completions.
   */
  const notesScanEpochRef = useRef(0);
  /** Detect pool-only switches to debounce scan start (avoid overlapping discovery across networks). */
  const prevNotesScanDepsRef = useRef<{ keysTick: string; chainId: ShieldedChainId } | null>(null);
  /** User-visible outcome of the last completed shielded scan (errors were previously silent). */
  type NotesScanBanner =
    | null
    | {kind: "error"; chainId: ShieldedChainId; message: string}
    | {kind: "empty_chain"; chainId: ShieldedChainId; netLabel: string}
    | {kind: "decrypt_mismatch"; chainId: ShieldedChainId; netLabel: string};
  const [notesScanBanner, setNotesScanBanner] = useState<NotesScanBanner>(null);

  useEffect(() => {
    if (!viewingPub || !viewingKey || !spendingKey) {
      lastResolvedScanByChainRef.current = {};
    }
  }, [viewingPub, viewingKey, spendingKey]);

  useEffect(() => {
    let mounted = true;

    async function checkHealth() {
      const startedAt = performance.now();
      try {
        const response = await fetch(`${RELAYER_URL}/healthz`, {cache: "no-store"});
        if (!mounted) return;
        setRelayerHealth({
          ok: response.ok,
          latencyMs: Math.round(performance.now() - startedAt),
          checkedAt: new Date().toISOString(),
        });
      } catch {
        if (!mounted) return;
        setRelayerHealth({
          ok: false,
          latencyMs: null,
          checkedAt: new Date().toISOString(),
        });
      }
    }

    checkHealth();
    const interval = window.setInterval(checkHealth, 15000);

    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, [setRelayerHealth]);

  useEffect(() => {
    if (persistHydrated) return;
    const unsub = useShieldedStore.persist.onFinishHydration(() => {
      setPersistHydrated(true);
    });
    if (useShieldedStore.persist.hasHydrated()) setPersistHydrated(true);
    return unsub;
  }, [persistHydrated]);

  useEffect(() => {
    if (!address || !persistHydrated) return;
    const hasCachedKeys =
      keyMaterialAddress?.toLowerCase() === address.toLowerCase() &&
      Boolean(spendingKey && viewingKey && viewingPub);
    if (hasCachedKeys) return;
    let cancelled = false;
    async function syncKeys() {
      try {
        const provider = getActiveInjectedProvider();
        if (!provider) return;
        const poolChainId = useShieldedStore.getState().shieldedRpcChainId;
        const keys = await deriveShieldedKeysFromWallet(
          address as `0x${string}`,
          async (message) =>
            (await provider.request({
              method: "personal_sign",
              params: [message, address],
            })) as `0x${string}`,
          poolChainId
        );
        if (cancelled) return;
        setKeyMaterial({
          spendingKey: keys.spendingKey.toString(),
          viewingKey: keys.viewingPriv.toString(),
          viewingPub: keys.viewingPub,
          ownerPk: keys.ownerPk.toString(),
          keyMaterialAddress: address as `0x${string}`,
        });
      } catch {
        // user may reject signature prompt
      }
    }
    void syncKeys();
    return () => {
      cancelled = true;
    };
  }, [address, keyMaterialAddress, persistHydrated, setKeyMaterial, spendingKey, viewingKey, viewingPub]);

  /** Poseidon `ownerPk` is fetched from the active shielded network's RPC; refresh when that network changes (no new signature). */
  useEffect(() => {
    if (!persistHydrated || !address || !spendingKey || !keyMaterialAddress) return;
    if (keyMaterialAddress.toLowerCase() !== address.toLowerCase()) return;
    let cancelled = false;
    async function refreshOwnerPkForShieldedNetwork() {
      const net = getShieldedNetwork(shieldedRpcChainId);
      if (!net) return;
      try {
        const provider = await getWorkingReadProvider(net);
        const poseidon = new ethers.Contract(net.contracts.poseidon, POSEIDON_ABI, provider);
        const pk = await deriveOwnerPk(BigInt(spendingKey), poseidon);
        if (cancelled) return;
        const next = pk.toString();
        if (next !== useShieldedStore.getState().ownerPk) {
          setOwnerPk(next);
        }
      } catch {
        /* keep previous ownerPk */
      }
    }
    void refreshOwnerPkForShieldedNetwork();
    return () => {
      cancelled = true;
    };
  }, [address, keyMaterialAddress, persistHydrated, shieldedRpcChainId, spendingKey, setOwnerPk]);

  useEffect(() => {
    let cancelled = false;
    async function resolveTokenMetadata() {
      if (!getShieldedNetwork(shieldedRpcChainId)) {
        setShieldedRpcChainId(normalizeStoredShieldedChainId(shieldedRpcChainId));
        return;
      }
      const net = getShieldedNetwork(shieldedRpcChainId)!;
      const defs = buildTokenDefinitionsForShieldedNetwork(net);
      setTokens(defs);
      try {
        const provider = await getWorkingReadProvider(net);
        const unique = Array.from(new Set(defs.map((t) => t.contractAddress.toLowerCase())));
        const resolved = await Promise.all(
          unique.map(async (addrLower) => {
            const def = defs.find((d) => d.contractAddress.toLowerCase() === addrLower);
            const addr = ethers.getAddress(addrLower) as `0x${string}`;
            let symbol = def?.symbol ?? "TOKEN";
            let decimals = def?.decimals ?? 18;
            try {
              const token = new ethers.Contract(addr, ERC20_ABI, provider);
              try {
                const s = await token.symbol();
                if (s != null && String(s).trim() !== "") symbol = String(s);
              } catch {
                /* IERC20Metadata missing or empty decode (BAD_DATA) */
              }
              try {
                const d = await token.decimals();
                const n = Number(d);
                if (Number.isFinite(n) && n >= 0 && n <= 36) decimals = n;
              } catch {
                /* keep def */
              }
            } catch {
              /* keep def */
            }
            return {
              symbol,
              name: symbol,
              decimals,
              accent: def?.accent ?? defs[0]?.accent ?? "",
              icon: symbol.slice(0, 1).toUpperCase(),
              contractAddress: addr,
            };
          })
        );
        if (!cancelled && resolved.length > 0) {
          setTokens(resolved);
        }
      } catch {
        /* defs already applied */
      }
    }
    void resolveTokenMetadata();
    return () => {
      cancelled = true;
    };
  }, [setShieldedRpcChainId, setTokens, shieldedRpcChainId]);

  useEffect(() => {
    if (!persistHydrated || !viewingPub || !viewingKey || !spendingKey) return;

    const keysTick = `${persistHydrated}|${spendingKey}|${viewingKey}|${viewingPub}`;
    const prev = prevNotesScanDepsRef.current;
    const debouncePoolSwitchOnly =
      prev != null && prev.keysTick === keysTick && prev.chainId !== shieldedRpcChainId;
    prevNotesScanDepsRef.current = { keysTick, chainId: shieldedRpcChainId };
    const debounceMs = debouncePoolSwitchOnly ? 220 : 0;

    let cancelled = false;
    let intervalId: number | null = null;
    let startTimer: number | null = null;

    const begin = () => {
      if (cancelled) return;
      const epoch = ++notesScanEpochRef.current;
      const activeViewingPub = viewingPub;
      const activeChainId = shieldedRpcChainId;
      setNotesScanBanner(null);
      let syncInFlight = false;
      let firstSyncInBegin = true;
      async function syncNotes() {
        if (syncInFlight) {
          if (shieldedScanDebugEnabled()) {
            shieldedScanDebug("syncNotes:skippedAlreadyInFlight", {chainId: activeChainId, epoch});
          }
          return;
        }
        syncInFlight = true;
        try {
          if (firstSyncInBegin) {
            firstSyncInBegin = false;
            useShieldedStore.getState().setShieldedBalanceLoading(true);
          }
          if (shieldedScanDebugEnabled()) {
            shieldedScanDebug("syncNotes:start", {
              chainId: activeChainId,
              epoch,
              debouncePoolSwitchOnly,
              debounceMs,
              hasViewingKey: Boolean(viewingKey),
              hasSpendingKey: Boolean(spendingKey),
            });
            const vkOk = validateStoredViewingKeyPair(viewingKey, activeViewingPub);
            const st = useShieldedStore.getState();
            const w = st.walletAddress;
            const km = st.keyMaterialAddress;
            shieldedScanDebug("syncNotes:keyConsistency", {
              walletEqualsKeyMaterialAddress: Boolean(w && km && w.toLowerCase() === km.toLowerCase()),
              walletPrefix: w ? `${w.slice(0, 10)}…` : null,
              keyMaterialPrefix: km ? `${km.slice(0, 10)}…` : null,
              viewingKeyRecomputesToViewingPub: vkOk,
              note: "Keys come from personal_sign consent; chainId here is pool network only. Extension uses a different seed (private key) — notes won't match.",
            });
            if (!vkOk) {
              console.warn(
                "[shielded-scan] Stored viewingKey does not re-derive to viewingPub. Try disconnect wallet → reconnect and re-sign, or clear site storage for this app."
              );
            }
          }
        if (!getShieldedNetwork(activeChainId)) {
          useShieldedStore.getState().setShieldedRpcChainId(normalizeStoredShieldedChainId(activeChainId));
          return;
        }
        const net = getShieldedNetwork(activeChainId)!;
        const cacheKey = shieldedScanCacheKey(activeChainId, net.contracts.pool, net.poolDeployBlock);
        const cachedRow = useShieldedStore.getState().shieldedScanCacheByPool[cacheKey];
        let priorCache: ShieldedScanCachePayload | null = null;
        if (cachedRow?.viewingPub?.toLowerCase() === activeViewingPub.toLowerCase()) {
          priorCache = {
            viewingPub: activeViewingPub as `0x${string}`,
            lastScannedBlock: cachedRow.lastScannedBlock,
            notes: storedDecryptedNotesToLive(cachedRow.notes),
          };
        }

        if (
          priorCache &&
          priorCache.notes.length > 0 &&
          useShieldedStore.getState().shieldedRpcChainId === activeChainId
        ) {
          /** Resolve nullifier spent state before painting UI — do not assume all unspent (was inflating balances). */
          const resolvedFromCache = await resolveNoteStates(priorCache.notes, BigInt(spendingKey), activeChainId);
          if (cancelled || epoch !== notesScanEpochRef.current) return;
          if (useShieldedStore.getState().shieldedRpcChainId !== activeChainId) return;
          useShieldedStore.getState().setNotes(mapNotesToUi(resolvedFromCache, useShieldedStore.getState().tokens, activeChainId));
          lastResolvedScanByChainRef.current[activeChainId] = resolvedFromCache;
          if (shieldedScanDebugEnabled()) {
            const st = useShieldedStore.getState();
            const unspent = resolvedFromCache.filter((n) => !n.isSpent).length;
            shieldedScanDebug("syncNotes:setNotesOptimisticCache", {
              activeChainId,
              epoch,
              mappedUiCount: st.notes.length,
              resolvedSourceCount: resolvedFromCache.length,
              unspentCount: unspent,
              spentCount: resolvedFromCache.length - unspent,
              shieldedChainIdOnFirst: st.notes[0]?.shieldedChainId ?? null,
            });
          }
          useShieldedStore.getState().setShieldedBalanceLoading(false);
        }

        const scan = await scanPrivateState(BigInt(viewingKey), activeViewingPub, activeChainId, {
          priorCache,
        });

        // Persist incremental scan cache for this pool **before** epoch / UI guards so a chain switch
        // mid-flight does not discard a completed `eth_getLogs` pass (fixes empty Arbitrum after scan found notes).
        if (!cancelled) {
          useShieldedStore.getState().setShieldedScanCacheEntry(cacheKey, {
            viewingPub: activeViewingPub,
            lastScannedBlock: scan.cacheOut.lastScannedBlock,
            notes: liveDecryptedNotesToStored(scan.cacheOut.notes),
          });
        }

        if (cancelled || epoch !== notesScanEpochRef.current) return;
        const storeChainAfterScan = useShieldedStore.getState().shieldedRpcChainId;
        if (storeChainAfterScan !== activeChainId) {
          if (shieldedScanDebugEnabled()) {
            shieldedScanDebug("syncNotes:abortedStalePoolNetwork", {
              scanWasForChainId: activeChainId,
              storeShieldedChainId: storeChainAfterScan,
              epoch,
              currentEpoch: notesScanEpochRef.current,
              phase: "afterScanPrivateState",
            });
          }
          return;
        }

        const resolvedNotes = await resolveNoteStates(scan.notes, BigInt(spendingKey), activeChainId);
        if (cancelled || epoch !== notesScanEpochRef.current) return;
        const storeChainAfterResolve = useShieldedStore.getState().shieldedRpcChainId;
        if (storeChainAfterResolve !== activeChainId) {
          if (shieldedScanDebugEnabled()) {
            shieldedScanDebug("syncNotes:abortedStalePoolNetwork", {
              scanWasForChainId: activeChainId,
              storeShieldedChainId: storeChainAfterResolve,
              epoch,
              currentEpoch: notesScanEpochRef.current,
              phase: "afterResolveNoteStates",
            });
          }
          return;
        }
        useShieldedStore.getState().setLastSyncedBlock(scan.stats.latestBlock);
        lastResolvedScanByChainRef.current[activeChainId] = resolvedNotes;
        useShieldedStore.getState().setNotes(mapNotesToUi(resolvedNotes, useShieldedStore.getState().tokens, activeChainId));
        if (shieldedScanDebugEnabled()) {
          const st = useShieldedStore.getState();
          shieldedScanDebug("syncNotes:setNotesAfterResolve", {
            activeChainId,
            epoch,
            resolvedNoteStates: resolvedNotes.length,
            storeUiNotes: st.notes.length,
            chainIdsSample: st.notes.slice(0, 5).map((n) => n.shieldedChainId),
          });
        }

        const totalLogs = scan.stats.totalLogs;
        if (resolvedNotes.length === 0) {
          if (totalLogs > 0) {
            console.warn(
              `[shielded-scan] ${net.label}: ${totalLogs} RoutedCommitment log(s) for your channel but none decrypted. Check keys / pool ABI, or enable NEXT_PUBLIC_SHIELDED_SCAN_DEBUG.`
            );
            setNotesScanBanner({kind: "decrypt_mismatch", chainId: activeChainId, netLabel: net.label});
          } else {
            setNotesScanBanner({
              kind: "empty_chain",
              chainId: activeChainId,
              netLabel: net.label,
            });
          }
        } else {
          setNotesScanBanner(null);
        }

        if (shieldedScanDebugEnabled()) {
          shieldedScanDebug("syncNotes:complete", {
            chainId: activeChainId,
            epoch,
            netLabel: net.label,
            noteCount: resolvedNotes.length,
            totalLogs,
          });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (shieldedScanDebugEnabled()) {
          shieldedScanDebug("syncNotes:error", {
            chainId: activeChainId,
            epoch,
            message,
            name: err instanceof Error ? err.name : undefined,
          });
        }
        console.error("[shielded-scan] syncNotes failed:", err);
        setNotesScanBanner({
          kind: "error",
          chainId: activeChainId,
          message: message.length > 280 ? `${message.slice(0, 280)}…` : message,
        });
      } finally {
        syncInFlight = false;
        useShieldedStore.getState().setShieldedBalanceLoading(false);
      }
      }
      void syncNotes();
      intervalId = window.setInterval(() => void syncNotes(), 30000);
    };

    if (debounceMs === 0) begin();
    else startTimer = window.setTimeout(() => begin(), debounceMs);

    return () => {
      cancelled = true;
      if (startTimer != null) window.clearTimeout(startTimer);
      if (intervalId != null) window.clearInterval(intervalId);
      useShieldedStore.getState().setShieldedBalanceLoading(false);
    };
  }, [persistHydrated, shieldedRpcChainId, spendingKey, viewingKey, viewingPub]);

  /** Re-apply token decimals/symbols to the last scan **for the active pool chain** when RPC metadata resolves. */
  useEffect(() => {
    const chain = shieldedRpcChainId;
    const cached = lastResolvedScanByChainRef.current[chain];
    if (!cached?.length) return;
    if (useShieldedStore.getState().shieldedRpcChainId !== chain) return;
    if (shieldedScanDebugEnabled()) {
      shieldedScanDebug("syncNotes:remapNotesForTokenDecimals", {chainId: chain, noteCount: cached.length});
    }
    setNotes(mapNotesToUi(cached, tokens, chain));
    if (shieldedScanDebugEnabled()) {
      const st = useShieldedStore.getState();
      shieldedScanDebug("syncNotes:setNotesAfterTokenRemap", {
        chainId: chain,
        resolvedCacheCount: cached.length,
        storeUiNotes: st.notes.length,
        chainIdsSample: st.notes.slice(0, 5).map((n) => n.shieldedChainId),
      });
    }
  }, [tokens, shieldedRpcChainId, setNotes]);

  const shieldedNetworks = getShieldedNetworks();

  return (
    <div className="app-theme">
      <div className="app-blob app-blob-a" aria-hidden />
      <div className="app-blob app-blob-b" aria-hidden />
      <div className="app-shell-content mx-auto flex min-h-screen w-full max-w-[1500px]">
        {mobileSidebarOpen ? (
          <button
            type="button"
            className="fixed inset-0 z-40 bg-[var(--brand-fg)]/25 backdrop-blur-[2px] lg:hidden"
            aria-label="Close navigation menu"
            onClick={() => setMobileSidebarOpen(false)}
          />
        ) : null}

        <aside
          className={cn(
            "app-sidebar fixed inset-y-0 left-0 z-50 w-[250px] border-r px-4 py-5 backdrop-blur-md transition-transform duration-200 lg:static lg:z-auto lg:translate-x-0",
            mobileSidebarOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <div className="flex items-center gap-2 px-2">
            <Link
              href="/"
              className="flex min-w-0 flex-1 items-center gap-3 rounded-xl py-1 transition hover:bg-[var(--brand-accent-soft)]"
              onClick={() => setMobileSidebarOpen(false)}
            >
              <div className="app-logo-mark size-8 shrink-0">
                <Shield className="size-4" strokeWidth={2} />
              </div>
              <p className="font-display font-semibold text-[var(--brand-fg)]">Shielded</p>
            </Link>
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(false)}
              className="app-btn-secondary inline-flex shrink-0 rounded-lg !h-auto !min-h-0 border p-1.5 !px-1.5 !py-1.5 shadow-none lg:hidden"
              aria-label="Close navigation"
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="mt-8 space-y-2">
            <p className="px-2 text-xs font-semibold uppercase tracking-wide text-[var(--brand-muted)]">Company</p>
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileSidebarOpen(false)}
                  className={cn("app-nav-link", active && "app-nav-link-active")}
                >
                  <TerminalSquare className="size-4" />
                  {item.label}
                </Link>
              );
            })}
          </div>
          <div className="mt-8 space-y-2">
            <p className="px-2 text-xs font-semibold uppercase tracking-wide text-[var(--brand-muted)]">Manage</p>
            <Link
              href="/faucet"
              onClick={() => setMobileSidebarOpen(false)}
              className={cn("app-nav-link w-full", pathname === "/faucet" && "app-nav-link-active")}
            >
              <Droplets className="size-4" /> Faucet
            </Link>
            <Link
              href="/settings"
              onClick={() => setMobileSidebarOpen(false)}
              className={cn("app-nav-link w-full", pathname === "/settings" && "app-nav-link-active")}
            >
              <Settings className="size-4" /> Settings
            </Link>
          </div>
        </aside>

        <div className="flex flex-1 flex-col px-3 py-3 sm:px-4 lg:px-6 lg:py-4">
          <header className="surface-panel rounded-2xl px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <nav className="flex items-center gap-5 text-sm text-[var(--brand-muted)]">
                <button
                  type="button"
                  onClick={() => setMobileSidebarOpen(true)}
                  className="app-btn-secondary inline-flex rounded-lg !h-auto border p-1.5 !px-1.5 !py-1.5 shadow-none lg:hidden"
                  aria-label="Open navigation"
                >
                  <Menu className="size-4" />
                </button>
                <span className="inline-flex items-center gap-1.5 font-medium text-[var(--brand-fg)]">
                  <House className="size-4 text-[var(--brand-accent)]" /> Home
                </span>
                <span className="app-badge-sync inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs">
                  Synced to block <strong>{lastSyncedBlock.toLocaleString()}</strong>
                </span>
              </nav>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {shieldedNetworks.length > 1 ? (
                  <label className="flex items-center gap-2 text-xs text-[var(--brand-muted)]">
                    <span className="whitespace-nowrap">Pool network</span>
                    <select
                      className="app-select px-2 py-1.5 text-xs"
                      value={shieldedRpcChainId}
                      onChange={(e) => onPoolNetworkChange(Number(e.target.value) as ShieldedChainId)}
                    >
                      {shieldedNetworks.map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <WalletConnection />
              </div>
            </div>
            <WalletNetworkSyncBanner />
            {notesScanBanner?.chainId === shieldedRpcChainId && notesScanBanner?.kind === "error" ? (
              <div
                role="alert"
                className="mt-3 flex flex-col gap-2 rounded-xl border border-red-200 bg-red-50/95 px-4 py-3 text-sm text-red-950 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="flex gap-2">
                  <AlertCircle className="mt-0.5 size-4 shrink-0 text-red-700" aria-hidden />
                  <div>
                    <p className="font-medium">Shielded note scan failed</p>
                    <p className="mt-1 text-xs leading-relaxed text-red-900/90">{notesScanBanner.message}</p>
                    <p className="mt-2 text-xs text-red-800/80">
                      Previous balances were left unchanged. Check RPC env vars and the console for details.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="shrink-0 self-end rounded-lg border border-red-200 bg-white px-2.5 py-1 text-xs font-medium text-red-900 hover:bg-red-50"
                  onClick={() => setNotesScanBanner(null)}
                >
                  Dismiss
                </button>
              </div>
            ) : null}
            {notesScanBanner?.chainId === shieldedRpcChainId && notesScanBanner?.kind === "empty_chain" ? (
              <div
                role="status"
                className="mt-3 flex flex-col gap-2 rounded-xl border border-sky-200 bg-sky-50/95 px-4 py-3 text-sm text-sky-950 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="flex gap-2">
                  <Info className="mt-0.5 size-4 shrink-0 text-sky-700" aria-hidden />
                  <div>
                    <p className="font-medium">No shielded notes on {notesScanBanner.netLabel}</p>
                    <p className="mt-1 text-xs leading-relaxed text-sky-900/90">
                      The scan finished successfully but found no <code className="rounded bg-white/80 px-1">RoutedCommitment</code> events
                      for your wallet on this pool. Shielded balances are per-chain: a deposit on Ethereum Sepolia does not appear when the
                      pool network is Base or Arbitrum until you shield on that chain too.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="shrink-0 self-end rounded-lg border border-sky-200 bg-white px-2.5 py-1 text-xs font-medium text-sky-900 hover:bg-sky-50"
                  onClick={() => setNotesScanBanner(null)}
                >
                  Dismiss
                </button>
              </div>
            ) : null}
            {notesScanBanner?.chainId === shieldedRpcChainId && notesScanBanner?.kind === "decrypt_mismatch" ? (
              <div
                role="alert"
                className="mt-3 flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50/95 px-4 py-3 text-sm text-amber-950 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="flex gap-2">
                  <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-700" aria-hidden />
                  <div>
                    <p className="font-medium">Events found on {notesScanBanner.netLabel} but none decrypted</p>
                    <p className="mt-1 text-xs leading-relaxed text-amber-900/90">
                      Your viewing key did not decrypt any ciphertext from the matched logs. Try disconnecting and signing again, confirm
                      you are using the same wallet that received the deposit, or enable shielded scan debug for details.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="shrink-0 self-end rounded-lg border border-amber-200 bg-white px-2.5 py-1 text-xs font-medium text-amber-950 hover:bg-amber-50"
                  onClick={() => setNotesScanBanner(null)}
                >
                  Dismiss
                </button>
              </div>
            ) : null}
          </header>

          <main className="flex-1 pt-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
