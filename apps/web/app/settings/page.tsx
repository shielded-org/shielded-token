"use client";

import {Check, Copy, Eye, EyeOff} from "lucide-react";
import {useMemo, useState} from "react";
import {PageShell} from "@/components/layout/page-shell";
import {Button} from "@/components/ui/button";
import {deriveShieldedAccountPreview} from "@/lib/shielded-account";
import {copyText} from "@/lib/utils";
import {useShieldedStore} from "@/store/use-shielded-store";

function KeyRow({
  label,
  value,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <article className="surface-subtle rounded-2xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-[#9ca3af]">{label}</p>
          <p className="mt-2 break-all font-mono text-xs text-[#111827]">{value}</p>
        </div>
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-[#e5e7eb] bg-white text-[#6b7280] hover:border-[#a5b4fc] hover:text-[#4f46e5]"
          aria-label={`Copy ${label}`}
        >
          {copied ? <Check className="size-4 text-[#4f46e5]" /> : <Copy className="size-4" />}
        </button>
      </div>
    </article>
  );
}

export default function SettingsPage() {
  const spendingKey = useShieldedStore((state) => state.spendingKey);
  const viewingKey = useShieldedStore((state) => state.viewingKey);
  const [showKeys, setShowKeys] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const accountPreview = useMemo(
    () => deriveShieldedAccountPreview(spendingKey, viewingKey),
    [spendingKey, viewingKey]
  );

  async function handleCopy(label: string, value: string) {
    await copyText(value);
    setCopiedField(label);
    window.setTimeout(() => setCopiedField((current) => (current === label ? null : current)), 1300);
  }

  return (
    <PageShell
      eyebrow="Security"
      title="Settings"
      description="Manage privacy and view key details for your local shielded account."
    >
      <section className="surface-panel rounded-[28px] p-6 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-[#111827]">Privacy controls</h2>
            <p className="mt-2 text-sm text-[#6b7280]">
              Key material is hidden by default. Reveal only when needed.
            </p>
          </div>
          <Button
            variant="secondary"
            onClick={() => setShowKeys((value) => !value)}
            icon={showKeys ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          >
            {showKeys ? "Hide details" : "Show details"}
          </Button>
        </div>

        {showKeys ? (
          <div className="mt-5 grid gap-3">
            <KeyRow
              label="Shielded address"
              value={accountPreview.shieldedAddress}
              copied={copiedField === "Shielded address"}
              onCopy={() => handleCopy("Shielded address", accountPreview.shieldedAddress)}
            />
            <KeyRow
              label="owner_pk"
              value={accountPreview.ownerPublicKey}
              copied={copiedField === "owner_pk"}
              onCopy={() => handleCopy("owner_pk", accountPreview.ownerPublicKey)}
            />
            <KeyRow
              label="viewing_pk"
              value={accountPreview.viewingPublicKey}
              copied={copiedField === "viewing_pk"}
              onCopy={() => handleCopy("viewing_pk", accountPreview.viewingPublicKey)}
            />
            <KeyRow
              label="owner private key"
              value={accountPreview.ownerPrivateKey}
              copied={copiedField === "owner private key"}
              onCopy={() => handleCopy("owner private key", accountPreview.ownerPrivateKey)}
            />
            <KeyRow
              label="viewing private key"
              value={accountPreview.viewingPrivateKey}
              copied={copiedField === "viewing private key"}
              onCopy={() => handleCopy("viewing private key", accountPreview.viewingPrivateKey)}
            />
          </div>
        ) : (
          <div className="surface-subtle mt-5 rounded-2xl p-4 text-sm text-[#6b7280]">
            Key details are hidden. Click &quot;Show details&quot; to inspect or copy values.
          </div>
        )}
      </section>
    </PageShell>
  );
}
