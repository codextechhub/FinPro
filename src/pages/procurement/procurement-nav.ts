/**
 * Procurement console sidebar, grouped into labelled sections (Procure to Pay,
 * Vendors & Catalog, Sourcing, Inventory, Analytics). Flat leaves, each a real
 * route, gated by the view permission its landing list requires; see
 * console-nav.ts for the rules.
 *
 * The analytics screens open on `procurement.analytics.view`, the key every
 * report endpoint checks. `procurement.report.view` is a different key: it
 * gates the insight panels on the vendor, category and catalog screens.
 */

import {
  LayoutDashboard, FileText, ShoppingCart, PackageCheck, ReceiptText, Banknote,
  ClipboardCheck, Store, Tags, Package, Send, FileSignature, Boxes, ArrowLeftRight,
  BarChart3, Scale, TrendingUp, Settings, Warehouse,
} from "lucide-react";
import type { ConsoleNavGroup } from "@/components/finance-ui/console-nav";
import { routesPath } from "@/routes/routes-path";
import { P } from "../../permissions";

const R = routesPath.PROTECTED.PROCUREMENT;

export const procurementNav: ConsoleNavGroup[] = [
  { items: [{ title: "Dashboard", url: R.INDEX, icon: LayoutDashboard }] },

  {
    label: "Procure to Pay",
    items: [
      { title: "Requisitions", url: R.REQUISITIONS, icon: FileText, permissions: [P.PROC_VIEW_REQUISITIONS] },
      { title: "Purchase Orders", url: R.PURCHASE_ORDERS, icon: ShoppingCart, permissions: [P.PROC_VIEW_PURCHASE_ORDERS] },
      { title: "Goods Receipts", url: R.GOODS_RECEIPTS, icon: PackageCheck, permissions: [P.PROC_VIEW_GOODS_RECEIPTS] },
      { title: "Vendor Invoices", url: R.VENDOR_INVOICES, icon: ReceiptText, permissions: [P.PROC_VIEW_VENDOR_INVOICES] },
      { title: "Vendor Payments", url: R.VENDOR_PAYMENTS, icon: Banknote, permissions: [P.PROC_VIEW_VENDOR_PAYMENTS] },
      // Frozen workflow snapshots can delegate a vote to a user who does not
      // currently hold the source RBAC key, so eligibility is enforced by the
      // entity-scoped queue endpoint rather than hiding this link by permission.
      { title: "Approvals", url: R.APPROVALS, icon: ClipboardCheck, resources: ["procurement.approval"] },
    ],
  },

  {
    label: "Vendors & Catalog",
    items: [
      { title: "Vendors", url: `${R.VENDORS}/vendors`, icon: Store, permissions: [P.PROC_VIEW_VENDORS], resources: ["procurement.report"] },
      { title: "Categories", url: `${R.VENDORS}/categories`, icon: Tags, permissions: [P.PROC_VIEW_CATEGORIES] },
      { title: "Catalog", url: `${R.VENDORS}/catalog`, icon: Package, permissions: [P.PROC_VIEW_CATALOG] },
    ],
  },

  {
    label: "Sourcing",
    items: [
      { title: "RFQs", url: `${R.SOURCING}/rfqs`, icon: Send, permissions: [P.PROC_VIEW_RFQS] },
      { title: "Quotations", url: `${R.SOURCING}/quotations`, icon: FileText, permissions: [P.PROC_VIEW_QUOTATIONS], resources: ["procurement.competition"] },
      { title: "Contracts", url: R.CONTRACTS, icon: FileSignature, permissions: [P.PROC_VIEW_CONTRACTS] },
    ],
  },

  {
    label: "Inventory",
    items: [
      { title: "Stock Items", url: `${R.INVENTORY}/items`, icon: Boxes, permissions: [P.PROC_VIEW_STOCK] },
      { title: "Movements", url: `${R.INVENTORY}/movements`, icon: ArrowLeftRight, permissions: [P.PROC_VIEW_STOCK] },
      { title: "Locations", url: `${R.INVENTORY}/locations`, icon: Warehouse, permissions: [P.PROC_VIEW_STOCK] },
    ],
  },

  {
    label: "Analytics",
    items: [
      { title: "AP Aging", url: `${R.ANALYTICS}/ap-aging`, icon: BarChart3, permissions: [P.PROC_VIEW_ANALYTICS] },
      { title: "GR/IR & Control", url: `${R.ANALYTICS}/grir`, icon: Scale, permissions: [P.PROC_VIEW_ANALYTICS] },
      { title: "Spend", url: `${R.ANALYTICS}/spend`, icon: BarChart3, permissions: [P.PROC_VIEW_ANALYTICS] },
      { title: "Vendor Performance", url: `${R.ANALYTICS}/performance`, icon: TrendingUp, permissions: [P.PROC_VIEW_ANALYTICS], resources: ["procurement.vendor_assessment"] },
    ],
  },

  {
    label: "Administration",
    items: [
      { title: "Settings", url: R.SETTINGS, icon: Settings, permissions: [P.PROC_VIEW_SETTINGS] },
    ],
  },

];
