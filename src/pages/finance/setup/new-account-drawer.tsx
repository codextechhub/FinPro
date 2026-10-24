/**
 * Setup → Chart of Accounts → Add an account.
 *
 * A bursar describes the account in plain words (what it is for, what it is
 * called) and the server chooses the code and the group it sits under. An
 * accountant who wants control reveals the code, parent, subtype and posting
 * options with "Choose my own code"; the client checks and the type-from-code
 * inference then apply as they always have, and the body carries the code.
 * Without an own code the body carries neither `code` nor `parent`.
 *
 * Above the form, the server lists common accounts (utilities, rent, and for a
 * school its fee lines) that go in with one click. The code shown beside the
 * type is the next free one in that type's range; the server chooses again on
 * save, so it is a preview rather than a reservation.
 *
 * The drawer, the next-code preview and the suggestions all belong to a holder
 * of the create key; the screen mounts it for no one else. Description, parent,
 * subtype and the posting options follow the `finance.account` Field Access
 * switches: a hidden one is not drawn, a read-only one is not sent.
 */
import { useMemo, useState } from "react";
import { skipToken } from "@reduxjs/toolkit/query";
import { toast } from "sonner";
import { Check, Plus } from "lucide-react";
import { AccessField, FormField, DetailDrawer, InfoHint, fieldWriteErrors, useFieldAccess, writableOnlyFollowing, type FieldErrors } from "@/components/finance-ui";
import { SearchSelect } from "@/components/custom/search-select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  useCreateAccountMutation, useGetAccountSuggestionsQuery, useGetNextAccountCodeQuery,
} from "@/redux/services/finance/setup-api";
import type { Account, AccountKind, AccountSuggestion, CreateAccountBody } from "@/redux/services/finance/setup-types";
import { ACCOUNT_CODE_LENGTH, accountCodeError, accountsInCodeLine, accountTypeFromCode, isValidAccountCode } from "@/utils/chart-of-accounts";
import { KIND_CHOICES, kindLabel } from "./account-kinds";

const FIELD_ACCESS_RESOURCE = "finance.account";
const CREATING = { creating: true } as const;

/** The body key `parent` is governed by the response name `parent_id`, which is how the registry lists it. */
const WRITE_FOLLOWS = { parent: "parent_id" } as const;

/** The server's own wording of a 400 refusal, shown as it was sent. */
function refusalText(error: unknown): string | null {
  const e = error as { status?: unknown; data?: { message?: unknown } } | null;
  if (!e || e.status !== 400) return null;
  return typeof e.data?.message === "string" && e.data.message ? e.data.message : null;
}

export function CreateAccountDrawer({ open, onClose, entity, parents }: {
  open: boolean; onClose: () => void; entity: string; parents: Account[];
}) {
  const access = useFieldAccess(FIELD_ACCESS_RESOURCE);
  const [create, { isLoading }] = useCreateAccountMutation();
  const [kind, setKind] = useState<AccountKind | "">("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [ownCode, setOwnCode] = useState(false);
  const [code, setCode] = useState("");
  const [parent, setParent] = useState("");
  const [subtype, setSubtype] = useState("");
  const [postable, setPostable] = useState(true);
  const [contra, setContra] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [suggestionRefusal, setSuggestionRefusal] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors | null>(null);

  const next = useGetNextAccountCodeQuery(
    open && kind && !ownCode ? { entity, account_type: kind } : skipToken,
    { refetchOnMountOrArgChange: true },
  );
  const suggestionsQuery = useGetAccountSuggestionsQuery(open ? { entity } : skipToken, { refetchOnMountOrArgChange: true });
  const suggestions = suggestionsQuery.data?.data ?? [];
  const nextCode = next.data?.data?.code ?? null;

  const existingCodes = useMemo(() => new Set(parents.map((account) => account.code)), [parents]);
  const inferredKind = accountTypeFromCode(code);
  const kindMismatch = ownCode && kind !== "" && inferredKind !== null && inferredKind !== kind
    ? `A code starting with ${code.trim().charAt(0)} is for "${kindLabel(inferredKind)}" accounts, and you chose "${kindLabel(kind)}". Change the code or the choice above.`
    : null;
  const codeError = ownCode ? (accountCodeError(code, existingCodes) ?? kindMismatch) : null;
  const ownCodeReady = !ownCode || (isValidAccountCode(code, existingCodes) && kindMismatch === null);
  const canSubmit = kind !== "" && name.trim() !== "" && ownCodeReady;
  const parentOptions = accountsInCodeLine(parents, code)
    .map((account) => ({ value: String(account.id), label: `${account.code} - ${account.name}` }));

  const reset = () => {
    setKind(""); setName(""); setDescription(""); setOwnCode(false); setCode(""); setParent("");
    setSubtype(""); setPostable(true); setContra(false); setRefusal(null); setSuggestionRefusal(null); setFieldErrors(null);
  };
  const close = () => { reset(); onClose(); };

  const chooseKind = (value: AccountKind) => {
    if (value !== kind && accountTypeFromCode(code) !== value) setParent("");
    setKind(value);
  };
  const startOwnCode = () => { setOwnCode(true); setCode(nextCode ?? ""); setRefusal(null); };
  const stopOwnCode = () => { setOwnCode(false); setCode(""); setParent(""); setRefusal(null); };
  const changeCode = (value: string) => {
    if (accountTypeFromCode(value) !== inferredKind) setParent("");
    setCode(value);
  };

  const submit = async () => {
    if (!canSubmit) return;
    const trimmedDescription = description.trim();
    const body: CreateAccountBody = ownCode
      ? {
        code: code.trim(),
        name: name.trim(),
        ...(trimmedDescription ? { description: trimmedDescription } : {}),
        ...(subtype.trim() ? { subtype: subtype.trim() } : {}),
        ...(parent ? { parent: Number(parent) } : {}),
        is_postable: postable,
        is_contra: contra,
      }
      : {
        account_type: kind,
        name: name.trim(),
        ...(trimmedDescription ? { description: trimmedDescription } : {}),
      };
    setRefusal(null);
    setFieldErrors(null);
    try {
      const r = await create({ entity, ...writableOnlyFollowing(access, body, WRITE_FOLLOWS, CREATING) }).unwrap();
      toast.success(r.message || "Account created.");
      close();
    } catch (error) {
      setFieldErrors(fieldWriteErrors(error));
      setRefusal(refusalText(error));
    }
  };

  const addSuggestion = async (suggestion: AccountSuggestion) => {
    setAdding(suggestion.key);
    setSuggestionRefusal(null);
    try {
      const body: CreateAccountBody = {
        account_type: suggestion.account_type,
        name: suggestion.name,
        ...(suggestion.description ? { description: suggestion.description } : {}),
      };
      const r = await create({ entity, ...writableOnlyFollowing(access, body, WRITE_FOLLOWS, CREATING) }).unwrap();
      toast.success(r.message || `${suggestion.name} added.`);
    } catch (error) {
      setSuggestionRefusal(refusalText(error));
    } finally {
      setAdding(null);
    }
  };

  return (
    <DetailDrawer
      open={open}
      onOpenChange={(o) => (o ? undefined : close())}
      title="Add an account"
      description="Pick one of the common accounts below, or describe your own."
      widthClass="sm:max-w-xl"
      footer={
        <>
          <Button variant="outline" disabled={isLoading} onClick={close}>Cancel</Button>
          <Button disabled={isLoading || !canSubmit} onClick={submit} className="gap-1.5">
            <Plus className="size-4" />{isLoading && adding === null ? "Saving…" : "Create account"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <CommonAccounts
          suggestions={suggestions}
          loading={suggestionsQuery.isLoading}
          adding={adding}
          busy={isLoading}
          onAdd={addSuggestion}
          refusal={suggestionRefusal}
        />

        <section className="space-y-4" aria-label="Describe your own account">
          <div role="radiogroup" aria-labelledby="new-account-purpose" className="space-y-2">
            <p id="new-account-purpose" className="font-mont text-sm font-semibold text-black-01">What is this account for?</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {KIND_CHOICES.map((choice) => {
                const selected = kind === choice.value;
                return (
                  <button
                    key={choice.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => chooseKind(choice.value)}
                    className={cn(
                      "rounded-md border px-3 py-2 text-left font-mont transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                      selected ? "border-primary bg-primary/5" : "border-white-02 bg-white hover:bg-primary/5",
                    )}
                  >
                    <span className="block text-sm font-semibold text-black-01">{choice.label}</span>
                    <span className="block text-[11px] text-gray-05">{choice.hint}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <FormField label="Name" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="bg-white" placeholder="e.g. Generator fuel" />
          </FormField>

          <AccessField access={access} name="description" label="Description" creating errors={fieldErrors}>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="bg-white"
              placeholder="Say what goes into it, e.g. diesel and servicing for the generator"
            />
          </AccessField>

          {kind !== "" ? (
            <div className="rounded-md bg-gray-02/60 px-3 py-2 font-mont text-xs text-gray-01">
              {ownCode ? (
                <button type="button" onClick={stopOwnCode} className="font-semibold text-primary hover:underline">
                  Let the system choose the code
                </button>
              ) : (
                <p>
                  {next.isFetching ? "Choosing a code…" : nextCode ? (
                    <>Code <span className="font-semibold tabular-nums">{nextCode}</span>, chosen for you. </>
                  ) : "The system will choose the code. "}
                  <button type="button" onClick={startOwnCode} className="font-semibold text-primary hover:underline">
                    Choose my own code
                  </button>
                </p>
              )}
            </div>
          ) : null}

          {ownCode ? (
            <div className="space-y-3 rounded-md border border-white-02 p-3">
              <div className="space-y-1">
                <div className="flex items-center gap-1">
                  <label htmlFor="new-account-code" className="font-mont text-xs text-gray-05">Code *</label>
                  <AccountCodeHint />
                </div>
                <Input
                  id="new-account-code"
                  value={code}
                  onChange={(e) => changeCode(e.target.value)}
                  className="bg-white font-mont"
                  placeholder="e.g. 4200"
                  inputMode="numeric"
                  maxLength={ACCOUNT_CODE_LENGTH}
                  pattern="[1-5][0-9]{3}"
                  aria-invalid={!!codeError}
                  aria-describedby={codeError ? "account-code-error" : undefined}
                  autoFocus
                />
                {codeError && <p id="account-code-error" className="font-mont text-xs text-destructive">{codeError}</p>}
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <AccessField access={access} name="subtype" label="Subtype" creating errors={fieldErrors}>
                  <Input value={subtype} onChange={(e) => setSubtype(e.target.value)} placeholder="e.g. Current asset" className="bg-white" />
                </AccessField>
                <AccessField access={access} name="parent_id" label="Parent account" creating errors={fieldErrors}>
                  <SearchSelect
                    options={parentOptions}
                    value={parent}
                    onChange={(e) => setParent(e.target.value)}
                    disabled={!isValidAccountCode(code, existingCodes)}
                    placeholder={inferredKind ? `None (${inferredKind.toLowerCase()} top level)` : "Enter a valid code first"}
                    revealOnSearch
                  />
                </AccessField>
              </div>
              {access.anyVisible("is_postable", "is_contra", CREATING) ? (
                <div className="flex flex-wrap gap-5 rounded-md bg-gray-50 px-3 py-3 font-mont text-sm text-gray-01">
                  <AccessField access={access} name="is_postable" creating errors={fieldErrors}>
                    <label className="flex items-center gap-2"><input type="checkbox" checked={postable} onChange={(e) => setPostable(e.target.checked)} className="accent-primary" /> Postable (accepts entries)</label>
                  </AccessField>
                  <AccessField access={access} name="is_contra" creating errors={fieldErrors}>
                    <label className="flex items-center gap-2"><input type="checkbox" checked={contra} onChange={(e) => setContra(e.target.checked)} className="accent-primary" /> Contra account</label>
                  </AccessField>
                </div>
              ) : null}
            </div>
          ) : null}

          {refusal ? <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 font-mont text-xs text-destructive">{refusal}</p> : null}
        </section>
      </div>
    </DetailDrawer>
  );
}

/**
 * The common accounts the server offers, grouped by the same five plain labels
 * as the question below. A row already in the chart reads "Added" and cannot be
 * added twice.
 */
function CommonAccounts({ suggestions, loading, adding, busy, onAdd, refusal }: {
  suggestions: AccountSuggestion[];
  loading: boolean;
  adding: string | null;
  busy: boolean;
  onAdd: (suggestion: AccountSuggestion) => void;
  refusal: string | null;
}) {
  if (loading || suggestions.length === 0) return null;
  const groups = KIND_CHOICES
    .map(({ value, label }) => ({ value, label, rows: suggestions.filter((s) => s.account_type === value) }))
    .filter((group) => group.rows.length > 0);
  return (
    <section className="space-y-2" aria-label="Common accounts">
      <h3 className="font-mont text-sm font-semibold text-black-01">Common accounts</h3>
      <p className="font-mont text-xs text-gray-05">Add one with a single click. The code is chosen for you.</p>
      <div className="max-h-72 space-y-3 overflow-y-auto rounded-md border border-white-02 p-3">
        {groups.map((group) => (
          <div key={group.value} className="space-y-1">
            <p className="font-mont text-[11px] font-semibold uppercase tracking-wide text-gray-05">{group.label}</p>
            <ul className="space-y-1">
              {group.rows.map((s) => (
                <li key={s.key} className="flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate font-mont text-sm text-black-01" title={s.description || undefined}>{s.name}</span>
                    {s.description ? <span className="block truncate font-mont text-[11px] text-gray-05">{s.description}</span> : null}
                  </span>
                  {s.already_added ? (
                    <Button type="button" size="sm" variant="outline" disabled className="shrink-0 gap-1 font-mont text-xs"><Check className="size-3.5" />Added</Button>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => onAdd(s)}
                      aria-label={`Add ${s.name}`}
                      className="shrink-0 font-mont text-xs"
                    >
                      {adding === s.key ? "Adding…" : "Add"}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {refusal ? <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 font-mont text-xs text-destructive">{refusal}</p> : null}
    </section>
  );
}

function AccountCodeHint() {
  const lines = [
    ["1", "Assets"],
    ["2", "Liabilities"],
    ["3", "Equity"],
    ["4", "Income"],
    ["5", "Expenses"],
  ];

  return (
    <InfoHint ariaLabel="View account code rules">
      <div className="w-52">
        <p className="mb-1.5 font-semibold">Use exactly four digits.</p>
        <div className="grid grid-cols-[1rem_1fr] gap-x-2 gap-y-1">
          {lines.map(([prefix, label]) => (
            <div key={prefix} className="contents">
              <span className="font-semibold">{prefix}</span>
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </InfoHint>
  );
}
