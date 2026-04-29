import {createHex} from "./utils";

export function deriveShieldedAccountPreview(spendingKey: string, viewingPrivateKey: string) {
  const ownerPublicKey = createHex(`owner-pk:${spendingKey}`);
  const viewingPublicKey = createHex(`viewing-pk:${viewingPrivateKey}`);

  return {
    ownerPublicKey,
    ownerPrivateKey: spendingKey,
    viewingPublicKey,
    viewingPrivateKey,
    shieldedAddress: createShieldedAddress(ownerPublicKey, viewingPublicKey),
  };
}

export function createShieldedAddress(ownerPublicKey: string, viewingPublicKey: string) {
  return `shd_${ownerPublicKey.slice(2, 34)}${viewingPublicKey.slice(2, 34)}`;
}

export function isShieldedAddress(value: string) {
  return /^shd_[a-f0-9]{64}$/i.test(value.trim());
}
