"use client";

import {create} from "zustand";
import {createJSONStorage, persist} from "zustand/middleware";
import {TOKENS} from "@/lib/constants";
import {
  buildTokenDefinitionsForShieldedNetwork,
  CHAIN_ID_ETH_SEPOLIA,
  defaultShieldedChainId,
  getShieldedNetwork,
  normalizeStoredShieldedChainId,
  type ShieldedChainId,
} from "@/lib/networks";
import type {
  AppMode,
  Note,
  RelayerHealth,
  ShieldedPoolChainId,
  ShieldedScanCacheRow,
  TokenDefinition,
  TransactionRecord,
  TransactionStatus,
} from "@/lib/types";

/** In-memory noop so `persist` always attaches `api.persist` during SSR (real `localStorage` would throw). */
const ssrNoopWebStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
} as unknown as Storage;

function getShieldedPersistStorage(): Storage {
  if (typeof window === "undefined") return ssrNoopWebStorage;
  return window.localStorage;
}

/** Always match pool token addresses to the active shielded chain (never persist cross-chain addresses). */
function tokensForShieldedChain(chainId: ShieldedChainId): TokenDefinition[] {
  const net = getShieldedNetwork(chainId) ?? getShieldedNetwork(CHAIN_ID_ETH_SEPOLIA);
  return net ? buildTokenDefinitionsForShieldedNetwork(net) : TOKENS;
}

type ShieldedState = {
  spendingKey: string;
  viewingKey: string;
  viewingPub: `0x${string}` | null;
  ownerPk: string;
  keyMaterialAddress: `0x${string}` | null;
  walletAddress: `0x${string}` | null;
  chainId: number | null;
  /** RPC network used for shielded pool reads / proofs (may differ from wallet chain until user switches wallet). */
  shieldedRpcChainId: ShieldedChainId;
  tokens: TokenDefinition[];
  notes: Note[];
  nullifiers: string[];
  mode: AppMode;
  lastSyncedBlock: number;
  revealBalances: boolean;
  transactions: TransactionRecord[];
  relayerHealth: RelayerHealth;
  /** Incremental RoutedCommitment scan cache per pool (parity with wallet-extension local scan cache). */
  shieldedScanCacheByPool: Record<string, ShieldedScanCacheRow>;
  /** True while the first note sync of the current scan cycle is in flight (or pool switched / keys refreshed). */
  shieldedBalanceLoading: boolean;
  setMode: (mode: AppMode) => void;
  setRevealBalances: (value: boolean) => void;
  setTokens: (tokens: TokenDefinition[]) => void;
  setWalletConnection: (walletAddress: `0x${string}` | null, chainId: number | null) => void;
  setShieldedRpcChainId: (chainId: ShieldedChainId) => void;
  setKeyMaterial: (keys: {
    spendingKey: string;
    viewingKey: string;
    viewingPub: `0x${string}`;
    ownerPk: string;
    keyMaterialAddress: `0x${string}`;
  }) => void;
  clearKeyMaterial: () => void;
  setNotes: (notes: Note[]) => void;
  setLastSyncedBlock: (block: number) => void;
  setRelayerHealth: (health: RelayerHealth) => void;
  setShieldedScanCacheEntry: (key: string, row: ShieldedScanCacheRow) => void;
  setShieldedBalanceLoading: (loading: boolean) => void;
  /** Recompute Poseidon `ownerPk` for the active shielded network without a new wallet signature. */
  setOwnerPk: (ownerPk: string) => void;
  addNote: (note: Note) => void;
  upsertTransaction: (transaction: TransactionRecord) => void;
  updateTransactionStatus: (id: string, status: TransactionStatus, txHash?: `0x${string}`) => void;
  markNoteSpent: (noteId: string, nullifier?: `0x${string}`) => void;
};

export const useShieldedStore = create<ShieldedState>()(
  persist(
    (set) => ({
      spendingKey: "",
      viewingKey: "",
      viewingPub: null,
      ownerPk: "",
      keyMaterialAddress: null,
      walletAddress: null,
      chainId: null,
      shieldedRpcChainId: defaultShieldedChainId(),
      tokens: tokensForShieldedChain(defaultShieldedChainId()),
      notes: [],
      nullifiers: [],
      mode: "pool",
      lastSyncedBlock: 21420391,
      revealBalances: false,
      transactions: [],
      relayerHealth: {
        ok: true,
        latencyMs: 82,
        checkedAt: new Date().toISOString(),
      },
      shieldedScanCacheByPool: {},
      shieldedBalanceLoading: false,
      setMode: (mode) => set({mode}),
      setRevealBalances: (revealBalances) => set({revealBalances}),
      setTokens: (tokens) => set({tokens}),
      setWalletConnection: (walletAddress, chainId) => set({walletAddress, chainId}),
      setShieldedRpcChainId: (shieldedRpcChainId) =>
        set((state) => {
          const next = normalizeStoredShieldedChainId(shieldedRpcChainId);
          const same = state.shieldedRpcChainId === next;
          return {
            shieldedRpcChainId: next,
            tokens: tokensForShieldedChain(next),
            ...(same
              ? {}
              : {
                  notes: [],
                  lastSyncedBlock: getShieldedNetwork(next)?.poolDeployBlock ?? 0,
                  transactions: [],
                  nullifiers: [],
                  shieldedBalanceLoading: Boolean(state.viewingKey),
                  /** Keep `shieldedScanCacheByPool` — entries are keyed per pool; wiping them forced a cold
                   * `eth_getLogs` from deploy on every L2 switch (~10s) and could interact badly with in-flight scans. */
                }),
          };
        }),
      setKeyMaterial: (keys) =>
        set({
          spendingKey: keys.spendingKey,
          viewingKey: keys.viewingKey,
          viewingPub: keys.viewingPub,
          ownerPk: keys.ownerPk,
          keyMaterialAddress: keys.keyMaterialAddress,
          shieldedScanCacheByPool: {},
          shieldedBalanceLoading: true,
        }),
      clearKeyMaterial: () =>
        set({
          spendingKey: "",
          viewingKey: "",
          viewingPub: null,
          ownerPk: "",
          keyMaterialAddress: null,
          shieldedScanCacheByPool: {},
          shieldedBalanceLoading: false,
        }),
      setNotes: (notes) => set({notes}),
      setLastSyncedBlock: (lastSyncedBlock) => set({lastSyncedBlock}),
      setRelayerHealth: (relayerHealth) => set({relayerHealth}),
      setShieldedScanCacheEntry: (key, row) =>
        set((state) => ({
          shieldedScanCacheByPool: {...state.shieldedScanCacheByPool, [key]: row},
        })),
      setShieldedBalanceLoading: (shieldedBalanceLoading) => set({shieldedBalanceLoading}),
      setOwnerPk: (ownerPk) => set({ownerPk}),
      addNote: (note) =>
        set((state) => ({
          notes: [note, ...state.notes],
        })),
      upsertTransaction: (transaction) =>
        set((state) => {
          const existing = state.transactions.find((item) => item.id === transaction.id);
          if (existing) {
            return {
              transactions: state.transactions.map((item) =>
                item.id === transaction.id ? transaction : item
              ),
            };
          }
          return {transactions: [transaction, ...state.transactions]};
        }),
      updateTransactionStatus: (id, status, txHash) =>
        set((state) => ({
          transactions: state.transactions.map((transaction) =>
            transaction.id === id
              ? {
                  ...transaction,
                  status,
                  txHash: txHash ?? transaction.txHash,
                }
              : transaction
          ),
        })),
      markNoteSpent: (noteId, nullifier) =>
        set((state) => ({
          notes: state.notes.map((note) =>
            note.id === noteId
              ? {
                  ...note,
                  status: "spent",
                  nullifier: nullifier ?? note.nullifier,
                }
              : note
          ),
          nullifiers: nullifier
            ? [...state.nullifiers, nullifier]
            : state.nullifiers,
        })),
    }),
    {
      name: "shielded-token-store",
      storage: createJSONStorage(getShieldedPersistStorage),
      merge: (persisted, current) => {
        const p = persisted as Partial<ShieldedState>;
        const merged = {...current, ...p};
        const nextChain = normalizeStoredShieldedChainId(p.shieldedRpcChainId ?? merged.shieldedRpcChainId);
        merged.shieldedRpcChainId = nextChain;
        merged.tokens = tokensForShieldedChain(nextChain);
        merged.shieldedScanCacheByPool = p.shieldedScanCacheByPool ?? merged.shieldedScanCacheByPool ?? {};
        merged.shieldedBalanceLoading = false;
        /** Pre-`shieldedChainId` persisted notes were always for the saved pool network (notes cleared on switch). */
        if (Array.isArray(merged.notes)) {
          merged.notes = merged.notes.map((note) =>
            note.shieldedChainId != null
              ? note
              : ({...note, shieldedChainId: nextChain as ShieldedPoolChainId} satisfies Note)
          );
        }
        return merged;
      },
      partialize: (state) => ({
        spendingKey: state.spendingKey,
        viewingKey: state.viewingKey,
        viewingPub: state.viewingPub,
        ownerPk: state.ownerPk,
        keyMaterialAddress: state.keyMaterialAddress,
        walletAddress: state.walletAddress,
        chainId: state.chainId,
        shieldedRpcChainId: normalizeStoredShieldedChainId(state.shieldedRpcChainId),
        notes: state.notes,
        nullifiers: state.nullifiers,
        mode: state.mode,
        lastSyncedBlock: state.lastSyncedBlock,
        revealBalances: state.revealBalances,
        transactions: state.transactions,
        shieldedScanCacheByPool: state.shieldedScanCacheByPool,
      }),
    }
  )
);
