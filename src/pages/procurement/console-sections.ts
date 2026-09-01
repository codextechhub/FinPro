// The sections each Procurement console screen actually has.
//
// Kept in one static module because two places need every list and they must not
// disagree: the route table declares one path per section, and the page maps each
// to a screen. The pages are lazy, so importing these from them would pull their
// chunks into the entry bundle.
//
// Registering `:section` instead of literal paths matches *any* URL and leaves the
// page deciding what is real - which is how a deleted report kept resolving from an
// old bookmark, quietly serving a different screen under the wrong heading. With
// only these declared, an unknown section matches no route and falls through to the
// app's own 404, outside the console layout, as a wrong address should.
//
// Each page keys its section map by the matching union, so declaring a section with
// no screen (or a screen with no route) is a compile error rather than a silently
// wrong page.

export const ANALYTICS_SECTIONS = [
  "ap-aging",
  "grir",
  "spend",
  "performance",
] as const;
export type AnalyticsSection = (typeof ANALYTICS_SECTIONS)[number];
export const DEFAULT_ANALYTICS_SECTION: AnalyticsSection = "ap-aging";

export const INVENTORY_SECTIONS = ["items", "movements", "locations"] as const;
export type InventorySection = (typeof INVENTORY_SECTIONS)[number];
export const DEFAULT_INVENTORY_SECTION: InventorySection = "items";

export const VENDOR_SECTIONS = ["vendors", "categories", "catalog"] as const;
export type VendorSection = (typeof VENDOR_SECTIONS)[number];
export const DEFAULT_VENDOR_SECTION: VendorSection = "vendors";

export const PROCUREMENT_SETTINGS_SECTIONS = [
  "overview",
  "general",
  "purchasing",
  "sourcing-lifecycle",
  "competitive-governance",
  "matching",
  "accounting",
  "approvals",
  "reference-data",
] as const;
export type ProcurementSettingsSection = (typeof PROCUREMENT_SETTINGS_SECTIONS)[number];
export const DEFAULT_PROCUREMENT_SETTINGS_SECTION: ProcurementSettingsSection = "overview";
