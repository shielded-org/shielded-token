import {createHex} from "./utils";
import type {Note, TransactionRecord} from "./types";

export const demoNotes: Note[] = [
  {
    id: "note-1",
    token: "sUSD",
    amount: "420.125000",
    status: "unspent",
    commitment: createHex("commitment-1"),
    encryptedNote: createHex("cipher-1"),
    discoveredAt: "2026-04-28T09:45:00.000Z",
    source: "shield",
    txHash: createHex("tx-1"),
  },
  {
    id: "note-2",
    token: "stETH",
    amount: "2.450000",
    status: "unspent",
    commitment: createHex("commitment-2"),
    encryptedNote: createHex("cipher-2"),
    discoveredAt: "2026-04-28T09:09:00.000Z",
    source: "transfer",
    txHash: createHex("tx-2"),
  },
  {
    id: "note-3",
    token: "sDAI",
    amount: "1550.000000",
    status: "spent",
    commitment: createHex("commitment-3"),
    nullifier: createHex("nullifier-3"),
    encryptedNote: createHex("cipher-3"),
    discoveredAt: "2026-04-28T06:42:00.000Z",
    source: "transfer",
    txHash: createHex("tx-3"),
  },
];

export const demoTransactions: TransactionRecord[] = [
  {
    id: "txrec-1",
    kind: "transfer",
    token: "sUSD",
    amount: "90.000000",
    createdAt: "2026-04-28T10:01:00.000Z",
    status: "confirmed",
    txHash: createHex("rec-1"),
    counterparty: createHex("recipient-1"),
  },
  {
    id: "txrec-2",
    kind: "shield",
    token: "stETH",
    amount: "2.450000",
    createdAt: "2026-04-28T09:21:00.000Z",
    status: "confirmed",
    txHash: createHex("rec-2"),
  },
  {
    id: "txrec-3",
    kind: "unshield",
    token: "sDAI",
    amount: "300.000000",
    createdAt: "2026-04-28T06:55:00.000Z",
    status: "submitted",
    requestId: "req_demo_9d1ab3",
    counterparty: createHex("recipient-3"),
  },
];
