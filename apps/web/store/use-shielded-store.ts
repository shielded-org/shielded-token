"use client";

import {create} from "zustand";
import {createJSONStorage, persist} from "zustand/middleware";
import {demoNotes, demoTransactions} from "@/lib/mock-data";
import {createHex} from "@/lib/utils";
import type {AppMode, Note, RelayerHealth, TransactionRecord, TransactionStatus} from "@/lib/types";

type ShieldedState = {
  spendingKey: string;
  viewingKey: string;
  notes: Note[];
  nullifiers: string[];
  mode: AppMode;
  lastSyncedBlock: number;
  revealBalances: boolean;
  transactions: TransactionRecord[];
  relayerHealth: RelayerHealth;
  setMode: (mode: AppMode) => void;
  setRevealBalances: (value: boolean) => void;
  setLastSyncedBlock: (block: number) => void;
  setRelayerHealth: (health: RelayerHealth) => void;
  addNote: (note: Note) => void;
  upsertTransaction: (transaction: TransactionRecord) => void;
  updateTransactionStatus: (id: string, status: TransactionStatus, txHash?: `0x${string}`) => void;
  markNoteSpent: (noteId: string, nullifier?: `0x${string}`) => void;
};

export const useShieldedStore = create<ShieldedState>()(
  persist(
    (set) => ({
      spendingKey: createHex("spending-key"),
      viewingKey: createHex("viewing-key"),
      notes: demoNotes,
      nullifiers: demoNotes
        .map((note) => note.nullifier)
        .filter((value) => typeof value === "string") as string[],
      mode: "pool",
      lastSyncedBlock: 21420391,
      revealBalances: false,
      transactions: demoTransactions,
      relayerHealth: {
        ok: true,
        latencyMs: 82,
        checkedAt: new Date().toISOString(),
      },
      setMode: (mode) => set({mode}),
      setRevealBalances: (revealBalances) => set({revealBalances}),
      setLastSyncedBlock: (lastSyncedBlock) => set({lastSyncedBlock}),
      setRelayerHealth: (relayerHealth) => set({relayerHealth}),
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
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        spendingKey: state.spendingKey,
        viewingKey: state.viewingKey,
        notes: state.notes,
        nullifiers: state.nullifiers,
        mode: state.mode,
        lastSyncedBlock: state.lastSyncedBlock,
        revealBalances: state.revealBalances,
        transactions: state.transactions,
      }),
    }
  )
);
