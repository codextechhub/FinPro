/**
 * The console menus against the backend's own key catalogue.
 *
 * Each menu entry names the permission its screen opens on, and each backend
 * key must belong to some screen. Both halves are checked here because both
 * failed silently before: hand-typed prefixes that matched no real key hid
 * screens from people entitled to them, and keys nobody placed on a screen put
 * Finance in the main menu for people who then found nothing inside it.
 */
import { describe, expect, it } from "vitest";
import { BACKEND_KEY_CATALOGUE } from "../../backend-key-catalogue";
import { FINANCE_PERMISSION_REGISTRY, type PermissionCode } from "../../permissions";
import { financeNav } from "../../pages/finance/finance-nav";
import { procurementNav } from "../../pages/procurement/procurement-nav";
import {
  activeNavTitle,
  consoleOffersScreens,
  visibleConsoleNav,
  type ConsoleNavChild,
  type ConsoleNavGate,
  type ConsoleNavGroup,
} from "./console-nav";

const CATALOGUE = new Set(BACKEND_KEY_CATALOGUE);
const ENGINE_MODULES = ["finance.", "payments.", "procurement."];

/**
 * Resources whose keys belong to no screen in this package, each with the
 * reason. The unmatched-webhook queue is platform-scoped: it lists provider
 * events that match no tenant, and the console shows it on its own Health
 * screen rather than inside any tenant's Finance console.
 */
const NOT_ON_A_CONSOLE_SCREEN: Record<string, string> = {
  "payments.unattributed_webhook": "platform Health screen in the console",
};

const resourceOf = (key: string) => key.split(".").slice(0, 2).join(".");

function entries(nav: ConsoleNavGroup[]): ConsoleNavChild[] {
  return nav.flatMap((group) =>
    group.items.flatMap((item) => (item.children?.length ? item.children : [item])),
  );
}

const ALL_ENTRIES = [...entries(financeNav), ...entries(procurementNav)];

/** A reader holding exactly these backend keys. */
function reader(...keys: string[]): ConsoleNavGate {
  const held = new Set(keys);
  return {
    hasAnyPermission: (...codes: PermissionCode[]) =>
      codes.some((code) => held.has(FINANCE_PERMISSION_REGISTRY[code])),
    hasModuleAccess: (...prefixes: string[]) =>
      keys.some((key) => prefixes.some((prefix) => key.startsWith(prefix))),
  };
}

const titles = (nav: ConsoleNavGroup[]) => entries(nav).map((entry) => entry.title);

describe("console menus against the backend key catalogue", () => {
  it("gates every screen on a code that names a real backend key", () => {
    const broken = ALL_ENTRIES.flatMap((entry) =>
      (entry.permissions ?? [])
        .filter((code) => !CATALOGUE.has(FINANCE_PERMISSION_REGISTRY[code]))
        .map((code) => `${entry.title}: ${code} -> ${FINANCE_PERMISSION_REGISTRY[code] ?? "(no mapping)"}`),
    );
    expect(broken).toEqual([]);
  });

  it("maps every permission code in the package to a real backend key", () => {
    const dead = Object.entries(FINANCE_PERMISSION_REGISTRY)
      .filter(([, key]) => !CATALOGUE.has(key))
      .map(([code, key]) => `${code} -> ${key}`);
    expect(dead).toEqual([]);
  });

  it("names only resources that exist in the catalogue", () => {
    const resources = new Set(BACKEND_KEY_CATALOGUE.map(resourceOf));
    const unknown = ALL_ENTRIES.flatMap((entry) =>
      (entry.resources ?? []).filter((resource) => !resources.has(resource)).map((r) => `${entry.title}: ${r}`),
    );
    expect(unknown).toEqual([]);
  });

  it("gives every finance, payments and procurement key a screen", () => {
    const owned = new Set<string>(Object.keys(NOT_ON_A_CONSOLE_SCREEN));
    for (const entry of ALL_ENTRIES) {
      for (const code of entry.permissions ?? []) owned.add(resourceOf(FINANCE_PERMISSION_REGISTRY[code]));
      for (const resource of entry.resources ?? []) owned.add(resource);
    }
    const homeless = BACKEND_KEY_CATALOGUE.filter(
      (key) => ENGINE_MODULES.some((m) => key.startsWith(m)) && !owned.has(resourceOf(key)),
    );
    expect(homeless).toEqual([]);
  });
});

describe("what a reader is offered", () => {
  it("shows a bursar the screens they can open and nothing they cannot", () => {
    const bursar = reader(
      "finance.invoice.view", "finance.invoice.create", "finance.payment.view",
      "finance.report.view", "payments.virtual_account.view",
    );
    const shown = titles(visibleConsoleNav(financeNav, bursar));

    expect(shown).toEqual(expect.arrayContaining([
      "Dashboard", "Invoices", "Receipts & Allocation", "Trial Balance", "Virtual Accounts",
    ]));
    expect(shown).not.toContain("Chart of Accounts");
    expect(shown).not.toContain("Collections");
    expect(consoleOffersScreens(financeNav, bursar)).toBe(true);
  });

  it("hides a screen from somebody who may act on its records but not list them", () => {
    const clerk = reader("finance.invoice.create");
    expect(titles(visibleConsoleNav(financeNav, clerk))).toEqual(["Dashboard"]);
    expect(consoleOffersScreens(financeNav, clerk)).toBe(false);
  });

  it("opens Refunds & Write-offs on either list key, not on the invoice write-off action", () => {
    expect(titles(visibleConsoleNav(financeNav, reader("finance.refund.view")))).toContain("Refunds & Write-offs");
    expect(titles(visibleConsoleNav(financeNav, reader("finance.writeoff.view")))).toContain("Refunds & Write-offs");
    expect(titles(visibleConsoleNav(financeNav, reader("finance.invoice.writeoff")))).not.toContain("Refunds & Write-offs");
  });

  it("opens the procurement analytics on the analytics key the reports check", () => {
    const analyst = reader("procurement.analytics.view");
    expect(titles(visibleConsoleNav(procurementNav, analyst))).toEqual(
      expect.arrayContaining(["Unpaid bills by age", "Spend", "Vendor Performance"]),
    );
    expect(titles(visibleConsoleNav(procurementNav, reader("procurement.report.view")))).not.toContain("Spend");
  });

  it("offers Procurement to an approval-coverage reader through the open approval queue", () => {
    const reviewer = reader("procurement.approval.view");
    expect(consoleOffersScreens(procurementNav, reviewer)).toBe(true);
    expect(titles(visibleConsoleNav(procurementNav, reviewer))).toEqual(["Dashboard", "Approvals"]);
  });

  it("does not offer a console whose only key opens no screen", () => {
    expect(consoleOffersScreens(financeNav, reader("finance.salary.view"))).toBe(false);
    expect(consoleOffersScreens(financeNav, reader())).toBe(false);
  });

  it("offers Between Branches only at a school with more than one branch", () => {
    const bursar = reader("finance.interbranch.view", "finance.payment.view");
    const between = (multiBranch?: boolean) =>
      visibleConsoleNav(financeNav, { ...bursar, multiBranch }).find((g) => g.label === "Between Branches");

    expect(between(true)?.items.map((i) => i.title)).toEqual([
      "Inter-branch Transfers", "Inter-branch Balances", "Held Receipts", "Recharges", "Shared Cost Rules",
    ]);
    // Sunrise Academy runs one branch: the whole group is absent, not empty.
    expect(between(false)).toBeUndefined();
    // A caller that cannot tell keeps the screens hidden.
    expect(between(undefined)).toBeUndefined();
  });

  it("offers Payouts and Batches only where the platform holds the school's money", () => {
    const bursar = reader("payments.payout.view", "payments.report.view");
    const payouts = (custody?: ConsoleNavGate["custody"]) =>
      visibleConsoleNav(financeNav, { ...bursar, custody })
        .flatMap((g) => g.items.map((i) => i.title))
        .filter((title) => title === "Payouts" || title === "Batches");

    // Bright Star runs HELD: both are offered.
    expect(payouts("HELD")).toEqual(["Payouts", "Batches"]);
    // Greenfield runs DIRECT, and a reader who cannot read the mode is treated alike.
    expect(payouts("DIRECT")).toEqual([]);
    expect(payouts("UNKNOWN")).toEqual([]);
    // A host that does not gate on custody follows the permissions alone.
    expect(payouts(undefined)).toEqual(["Payouts", "Batches"]);
    expect(consoleOffersScreens(financeNav, { ...reader("payments.payout.view"), custody: "DIRECT" })).toBe(false);
  });

  it("offers Payment provider activity only to a holder of the payments report key", () => {
    const shown = (...keys: string[]) => titles(visibleConsoleNav(financeNav, reader(...keys)));
    expect(shown("payments.report.view")).toContain("Payment provider activity");
    expect(shown("payments.payout.view", "payments.collection.view")).not.toContain("Payment provider activity");
  });

  it("drops a group whose every screen is closed rather than showing an empty heading", () => {
    const labels = visibleConsoleNav(financeNav, reader("finance.invoice.view")).map((g) => g.label);
    expect(labels).toEqual([undefined, "Receivables"]);
  });
});

/**
 * The header names the screen the reader is on. A bursar at Holy Cross who
 * opens Customer Invoices from the dashboard lands on the section's bare
 * address, /finance/receivables, which no menu item names; the header must not
 * call that screen "Dashboard" because the dashboard's address is a prefix of it.
 */
describe("the console header's title", () => {
  const leaves = financeNav.flatMap((group) => group.items.flatMap((item) => item.children?.length ? item.children : [item]));
  const url = (title: string) => leaves.find((item) => item.title === title)!.url;
  const section = (title: string) => url(title).slice(0, url(title).lastIndexOf("/"));

  it("names the menu item whose address the reader is on", () => {
    expect(activeNavTitle(financeNav, url("Invoices"))).toBe("Invoices");
    expect(activeNavTitle(financeNav, url("Dashboard"))).toBe("Dashboard");
  });

  it("does not let the console root claim a section's bare address", () => {
    expect(activeNavTitle(financeNav, section("Invoices"))).toBeNull();
    expect(activeNavTitle(financeNav, section("Budgets & Forecasts"))).toBeNull();
  });
});
