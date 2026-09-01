# @xvs/finance

The finance and procurement product, shared by the CodeX console and the school
app. Extracted because `vs_finance` and `vs_procurement` are domain-neutral, so
these are the finance engine's screens rather than either product's.

## Host contract

This package is consumed **as TypeScript source**, and resolves `@/*` against
the *consuming* application. That is deliberate and it is why the extraction was
cheap: both apps already expose the same paths.

A host must provide:

| Path | What |
|---|---|
| `@/components/ui/*` | the shadcn primitives, including `card-surface` |
| `@/lib/utils` | `cn` |
| `@/redux/store` | `useAppDispatch`, `useAppSelector` |
| `@/hooks/use-permissions` | `usePermissions` |
| `@/components/custom/*` | `PermissionGate`, skeletons |
| `@/routes/routes-path` | the route table, for nav URLs |

A host must also register this package's API slices and reducers in its own
store.

## What must not be tidied

**Finance reads a blank branch inclusively; procurement reads it exclusively.**
Both are deliberate and both are correct. They will look like an inconsistency
to anyone reading the two halves side by side in this package. Do not unify
them; see the backend's own note in `vs_finance` and `vs_procurement`.
