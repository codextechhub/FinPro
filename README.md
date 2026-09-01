# @xvs/finance

The finance and procurement product, shared by the CodeX console and the school
app. Extracted because `vs_finance` and `vs_procurement` are domain-neutral, so
these are the finance engine's screens rather than either product's.

## Adopting this package: the checklist

None of these is discoverable from the public API. You find them by compiling,
which is how this list was written.

1. **Install and resolve it as SOURCE.** `file:../FinPro` locally (npm makes it
   a symlink), or `git+https://github.com/codextechhub/FinPro.git#<tag>` in CI.
   Then, in every toolchain the app uses:
   - `preserveSymlinks: true` in tsconfig AND vite/vitest. Without it both
     resolve this package's imports from the symlink's REAL path, outside your
     app, where react does not exist - and every type here degrades to `any`.
   - tsconfig `include` the package, and narrow `exclude`: it defaults to
     `["node_modules", ...]` and FILTERS include, so the package is silently
     not compiled.
   - `optimizeDeps: { exclude: ["@xvs/finance"] }`, or Vite pre-bundles it and
     its `@/*` imports resolve against nothing.
   - vitest `include` the package's tests and override `exclude`; discovery
     skips node_modules, so your suite shrinks and still reports OK.
   - `esbuild: { jsx: "automatic" }` for vitest; esbuild does not read
     tsconfig's jsx setting under node_modules, and every component here throws
     "React is not defined" at render.

2. **Spread the permission codes** into your `P`: `...FINANCE_CODES` from
   `@xvs/finance/permissions`. They gate this package's screens, so it owns
   them. Transcribing them is how one product silently stops gating.

3. **Spread the RTK tag types** into your base api's `tagTypes`:
   `...FINANCE_TAG_TYPES` from `@xvs/finance/redux/tag-types`. RTK refuses any
   tag the base api has not declared.

4. **Mount the reducer**: `financeEntity: entitySliceReducer`. The selected
   ledger entity lives in redux and needs somewhere to live.

5. **Implement `HostContract`** in a module aliased to `@xvs-host`. See below.

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

## Before a third product adopts this

**Check its permission code numbering against `permissions.ts` first.** Nothing
enforces separation, and a clash is silent.

The console and the school app had independently given the SAME numbers to
DIFFERENT permissions - `100601` meant `platform.audit.view` here and
`school.fees.view` there. Harmless while the two apps were separate; the moment
both tables merged in one app the number was ambiguous, and one product's screen
would have gated on the other's permission. Five were renumbered on this side in
September 2026, each staying inside its own module range (`1xxxxx` platform,
`2xxxxx` finance, `7xxxxx` procurement, `8xxxxx` payments).

Watch for the quieter version too: two NAMES for one code and one key, which is
how a permission audit reports a gated screen as ungated.

## What must not be tidied

**Finance reads a blank branch inclusively; procurement reads it exclusively.**
Both are deliberate and both are correct. They will look like an inconsistency
to anyone reading the two halves side by side in this package. Do not unify
them; see the backend's own note in `vs_finance` and `vs_procurement`.
