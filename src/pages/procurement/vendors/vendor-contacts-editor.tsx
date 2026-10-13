/**
 * The vendor form's list of contact people.
 *
 * Each detail and each routing flag follows its own `procurement.vendor_contact`
 * switch: one the role may not read is not on the row at all, one it may read
 * but not change is greyed, and the Add contact and Remove controls appear only
 * for a role that may write the email, because the email is what identifies a
 * person. The rows it hands back keep every field they were given; the form
 * submits them through `contactsChange`, which drops what the role may not
 * write.
 */

import { Plus, Trash2 } from "lucide-react";

import { AccessField, useFieldAccess } from "@/components/finance-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { VendorContact } from "@/redux/services/procurement/procurement-types";
import { VENDOR_CONTACT, blankContact, canChangeContactList } from "./vendor-contacts";

export interface VendorContactsEditorProps {
  rows: VendorContact[];
  onChange: (rows: VendorContact[]) => void;
  /** The refusal message to show beneath the list, when a save named a contact field. */
  error?: string | null;
}

export function VendorContactsEditor({ rows, onChange, error }: VendorContactsEditorProps) {
  const access = useFieldAccess(VENDOR_CONTACT);
  const canChangeList = canChangeContactList(access);
  const update = (index: number, patch: Partial<VendorContact>) => onChange(rows.map((row, position) => (position === index ? { ...row, ...patch } : row)));

  return <div className="rounded-md border border-white-02 p-3" data-field="contacts">
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="font-mont text-xs font-semibold">Vendor contacts</p>
        <p className="mt-1 text-[11px] text-gray-05">Choose who receives RFQs and approved purchase orders.</p>
      </div>
      {canChangeList ? <Button type="button" size="sm" variant="outline" onClick={() => onChange([...rows, blankContact(access, rows.length === 0)])}><Plus className="size-3.5" /> Add contact</Button> : null}
    </div>
    <div className="mt-3 space-y-3">
      {rows.map((contact, index) => <div key={contact.id ?? `new-${index}`} data-contact-row className="grid grid-cols-1 gap-2 rounded border border-white-02 bg-gray-50 p-3 sm:grid-cols-2">
        <AccessField access={access} name="name"><Input aria-label="Contact name" value={contact.name ?? ""} onChange={(event) => update(index, { name: event.target.value })} placeholder="Contact name" /></AccessField>
        <AccessField access={access} name="email"><Input aria-label="Contact email" type="email" value={contact.email ?? ""} onChange={(event) => update(index, { email: event.target.value })} placeholder="Contact email" /></AccessField>
        <AccessField access={access} name="phone"><Input aria-label="Contact phone" value={contact.phone ?? ""} onChange={(event) => update(index, { phone: event.target.value })} placeholder="Phone (optional)" /></AccessField>
        <div className="flex flex-wrap items-center gap-3">
          <AccessField access={access} name="is_primary"><label className="flex items-center gap-1.5 text-xs"><input type="radio" name="primary-contact" checked={!!contact.is_primary} onChange={() => onChange(rows.map((row, position) => ({ ...row, is_primary: position === index })))} /> Primary</label></AccessField>
          <AccessField access={access} name="receives_rfqs"><label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={!!contact.receives_rfqs} onChange={(event) => update(index, { receives_rfqs: event.target.checked })} /> Receives RFQs</label></AccessField>
          <AccessField access={access} name="receives_purchase_orders"><label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={!!contact.receives_purchase_orders} onChange={(event) => update(index, { receives_purchase_orders: event.target.checked })} /> Receives purchase orders</label></AccessField>
          <AccessField access={access} name="is_active"><label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={!!contact.is_active} onChange={(event) => update(index, { is_active: event.target.checked })} /> Active</label></AccessField>
          {canChangeList ? <Button type="button" size="icon" variant="ghost" className="ml-auto" aria-label="Remove contact" onClick={() => onChange(rows.filter((_, position) => position !== index))}><Trash2 className="size-4 text-destructive" /></Button> : null}
        </div>
      </div>)}
      {rows.length === 0 && <p className="py-2 text-center text-xs text-gray-05">The primary vendor email will be used until contacts are added.</p>}
    </div>
    {error ? <p role="alert" className="mt-2 font-mont text-[11px] text-destructive">{error}</p> : null}
  </div>;
}
