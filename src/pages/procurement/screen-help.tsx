import { InfoHint } from "@/components/finance-ui";

export const PROCUREMENT_HELP = {
  dashboard: "Shows purchasing, supplier, approval, and stock activity available to you.",
  requisitions: "Internal requests record what teams need before a purchase order is raised.",
  purchaseOrders: "Approved orders tell vendors what to supply and track receipt and billing progress.",
  goodsReceipts: "Records what vendors delivered, including accepted, rejected, and inspected quantities.",
  vendorInvoices: "Supplier bills are matched, approved, and posted before they become payable.",
  vendorPayments: "Settles approved supplier bills and records the payment in Finance.",
  approvals: "Lists Procurement documents currently waiting for an approval action from you.",
  vendors: "Maintains supplier identity, eligibility, terms, contacts, and purchasing history.",
  categories: "Organises vendors and catalog items for purchasing controls and spend reporting.",
  catalog: "Maintains the goods and services buyers can select on purchasing documents.",
  rfqs: "Requests comparable prices and terms from selected vendors before an award.",
  quotations: "Compares vendor offers received for RFQs and records the selected offer.",
  contracts: "Tracks active supplier agreements, values, dates, milestones, and renewals.",
  stockItems: "Shows inventory items, quantities, costs, and reorder positions by store.",
  stockMovements: "Shows every stock receipt, issue, transfer, return, and adjustment.",
  stockLocations: "Maintains the stores and stock-holding points used by inventory movements.",
  unpaidBills: "Groups unpaid supplier bills by how long they have been outstanding.",
  goodsNotBilled: "Shows received goods that have not yet been matched to a supplier bill.",
  spend: "Analyses posted purchasing spend by category, vendor, and period.",
  vendorPerformance: "Measures supplier delivery, quality, pricing, and payment behaviour.",
  settings: "Controls Procurement defaults, purchasing rules, matching, accounts, and approvals.",
} as const;

export type ProcurementHelpKey = keyof typeof PROCUREMENT_HELP;

export const PROCUREMENT_HELP_BY_NAV_TITLE: Record<string, ProcurementHelpKey> = {
  Dashboard: "dashboard",
  Requisitions: "requisitions",
  "Purchase Orders": "purchaseOrders",
  "Goods Receipts": "goodsReceipts",
  "Vendor Invoices": "vendorInvoices",
  "Vendor Payments": "vendorPayments",
  Approvals: "approvals",
  Vendors: "vendors",
  Categories: "categories",
  Catalog: "catalog",
  RFQs: "rfqs",
  Quotations: "quotations",
  Contracts: "contracts",
  "Stock Items": "stockItems",
  Movements: "stockMovements",
  Locations: "stockLocations",
  "Unpaid bills by age": "unpaidBills",
  "Goods not yet billed": "goodsNotBilled",
  Spend: "spend",
  "Vendor Performance": "vendorPerformance",
  Settings: "settings",
};

export function ProcurementPageTitle({ screen, children }: {
  screen: ProcurementHelpKey;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <h1 className="font-mont text-lg font-semibold text-gray-01">{children}</h1>
      <InfoHint ariaLabel={`About ${String(children)}`}>{PROCUREMENT_HELP[screen]}</InfoHint>
    </div>
  );
}
