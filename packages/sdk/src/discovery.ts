import {hashField} from "./hash";
import type {DiscoveredNote, Hex, NewCommitmentEvent} from "./types";

function decryptAmount(ciphertext: Hex, incomingViewingKey: bigint): bigint {
  const mask = hashField(ciphertext, incomingViewingKey);
  return (BigInt(ciphertext) ^ mask) & ((1n << 64n) - 1n);
}

export function discoverNotes(events: NewCommitmentEvent[], incomingViewingKey: bigint): DiscoveredNote[] {
  const notes: DiscoveredNote[] = [];
  for (const event of events) {
    const ownerTag = hashField(incomingViewingKey, BigInt(event.index));
    const expectedTag = hashField(event.senderHint, incomingViewingKey);
    if ((ownerTag & 0xfffn) !== (expectedTag & 0xfffn)) {
      continue;
    }

    notes.push({
      txHash: event.txHash,
      commitment: event.commitment,
      amount: decryptAmount(event.ciphertext, incomingViewingKey),
      ownerTag: `0x${ownerTag.toString(16)}` as Hex,
      noteIndex: event.index,
    });
  }
  return notes;
}
