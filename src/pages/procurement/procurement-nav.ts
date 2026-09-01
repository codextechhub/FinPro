// Procurement console sidebar (§7) - grouped into labelled sections like the
// design (Procure to Pay / Vendors & Catalog / Sourcing / Inventory / Analytics /
// Payments). Flat leaves, each a real route; gated by backend key prefixes.

import {
  LayoutDashboard, FileText, ShoppingCart, PackageCheck, ReceiptText, Banknote,
  ClipboardCheck, Store, Tags, Package, Send, FileSignature, Boxes, ArrowLeftRight,
  BarChart3, Scale, TrendingUp, Settings, Warehouse,
} from "lucide-react";
import type { ConsoleNavGroup } from "@/components/finance-ui/console-nav";
import { routesPath } from "@/routes/routes-path";

const P = routesPath.PROTECTED.PROCUREMENT;

export const procurementNav: ConsoleNavGroup[] = [
  { items: [{ title: "Dashboard", url: P.INDEX, icon: LayoutDashboard }] },

  {
    label: "Procure to Pay",
    items: [
      { title: "Requisitions", url: P.REQUISITIONS, icon: FileText, prefixes: ["procurement.requisition."] },
      { title: "Purchase Orders", url: P.PURCHASE_ORDERS, icon: ShoppingCart, prefixes: ["procurement.purchase_order."] },
      { title: "Goods Receipts", url: P.GOODS_RECEIPTS, icon: PackageCheck, prefixes: ["procurement.goods_receipt."] },
      { title: "Vendor Invoices", url: P.VENDOR_INVOICES, icon: ReceiptText, prefixes: ["procurement.vendor_invoice."] },
      { title: "Vendor Payments", url: P.VENDOR_PAYMENTS, icon: Banknote, prefixes: ["procurement.vendor_payment."] },
      // Frozen workflow snapshots can delegate a vote to a user who does not
      // currently hold the source RBAC key, so eligibility is enforced by the
      // entity-scoped queue endpoint rather than hiding this link by permission.
      { title: "Approvals", url: P.APPROVALS, icon: ClipboardCheck },
    ],
  },

  {
    label: "Vendors & Catalog",
    items: [
      { title: "Vendors", url: `${P.VENDORS}/vendors`, icon: Store, prefixes: ["procurement.vendor."] },
      { title: "Categories", url: `${P.VENDORS}/categories`, icon: Tags, prefixes: ["procurement.category."] },
      { title: "Catalog", url: `${P.VENDORS}/catalog`, icon: Package, prefixes: ["procurement.catalog_item."] },
    ],
  },

  {
    label: "Sourcing",
    items: [
      { title: "RFQs", url: `${P.SOURCING}/rfqs`, icon: Send, prefixes: ["procurement.rfq."] },
      { title: "Quotations", url: `${P.SOURCING}/quotations`, icon: FileText, prefixes: ["procurement.quotation."] },
      { title: "Contracts", url: P.CONTRACTS, icon: FileSignature, prefixes: ["procurement.contract."] },
    ],
  },

  {
    label: "Inventory",
    items: [
      { title: "Stock Items", url: `${P.INVENTORY}/items`, icon: Boxes, prefixes: ["procurement.stock."] },
      { title: "Movements", url: `${P.INVENTORY}/movements`, icon: ArrowLeftRight, prefixes: ["procurement.stock."] },
      { title: "Locations", url: `${P.INVENTORY}/locations`, icon: Warehouse, prefixes: ["procurement.stock."] },
    ],
  },

  {
    label: "Analytics",
    items: [
      { title: "AP Aging", url: `${P.ANALYTICS}/ap-aging`, icon: BarChart3, prefixes: ["procurement.report."] },
      { title: "GR/IR & Control", url: `${P.ANALYTICS}/grir`, icon: Scale, prefixes: ["procurement.report."] },
      { title: "Spend", url: `${P.ANALYTICS}/spend`, icon: BarChart3, prefixes: ["procurement.report."] },
      { title: "Vendor Performance", url: `${P.ANALYTICS}/performance`, icon: TrendingUp, prefixes: ["procurement.report."] },
    ],
  },

  {
    label: "Administration",
    items: [
      { title: "Settings", url: P.SETTINGS, icon: Settings, prefixes: ["procurement.settings."] },
    ],
  },

];
