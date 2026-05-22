import {NAV_ITEMS} from "./constants";

const EXTRA: Record<string, string> = {
  "/faucet": "Faucet",
  "/settings": "Settings",
};

/** Mobile app header title from pathname. */
export function appPageTitle(pathname: string): string {
  const nav = NAV_ITEMS.find((item) => item.href === pathname);
  if (nav) return nav.label;
  return EXTRA[pathname] ?? "Shielded";
}
