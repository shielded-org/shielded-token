import {concatHex, keccak256, toHex} from "viem";

import type {Hex} from "./types";

export function hashParts(parts: Array<bigint | Hex>): Hex {
  const normalized = parts.map((part) => (typeof part === "bigint" ? toHex(part, {size: 32}) : part));
  return keccak256(concatHex(normalized));
}

export function hashField(...parts: Array<bigint | Hex>): bigint {
  return BigInt(hashParts(parts));
}
