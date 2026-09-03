# AGENTS.md - FinPro (`@xvs/finance`)

## What this package is

`@xvs/finance` is the finance and procurement product: the screens for the
domain-neutral `vs_finance`, `vs_procurement` and `vs_payments` engines. It is
shared by two applications, `console-fe` and `school-fe`, and it belongs to
neither of them.

It is consumed **as TypeScript source**, not as a build artifact. `@/*` imports
resolve against the *consuming* application, which is why the extraction was
cheap and why the boundary is fragile. `README.md` carries the adoption
checklist and the host contract; read it before changing anything that crosses
the boundary.

Three rules hold here and nowhere else:

1. **Nothing may reach outside the package by relative path.** A single import
   escaping `src/` produced 86 bogus "implicitly any" errors somewhere else
   entirely. Everything a host must supply goes through the host contract.
2. **Permission codes stay inside their module range** - `1xxxxx` platform,
   `2xxxxx` finance, `7xxxxx` procurement, `8xxxxx` payments. Nothing enforces
   this and a clash is silent: the console and the school app once gave `100601`
   to two different permissions, and the moment both tables merged one product's
   screen gated on the other product's permission.
3. **Finance reads a blank branch inclusively; procurement reads it
   exclusively.** Both are deliberate and both are correct. Reading the two
   halves side by side they look like an inconsistency. Do not unify them.

## The commands

This package has no dev server, no build and no test runner of its own. It runs
inside whichever application consumes it, so screens are exercised from
`console-fe` or `school-fe`, never from here.

Two checks belong to the package, and both read something no typecheck does:

```bash
node check-boundary.mjs   # nothing escapes src/, no orphaned or undiscovered tests
node check-exports.mjs    # every public subpath resolves to a file that exists
```

`check-exports.mjs` exists because a green build proved nothing: `v0.1.0`
typechecked, built and tested clean in both applications, then blanked the
console's finance area on open because its exports map pointed at files that do
not exist.

Cutting a version and moving both applications onto it:

```bash
./release.sh v0.2.0 "bank reconciliation screen"
```

It refuses a dirty or unpushed tree, runs both checks, tags, installs into both
applications, and restores the console's npm link that the install overwrites.
It moves versions; it does not verify them. Committing the two lockfiles and
running both suites afterwards is still yours.

## Holistic problem solving

When the user asks for a problem to be fixed, trace it to its root cause and
fix the shared source of the failure where practical. Review adjacent flows,
callers, and equivalent modules for the same failure mode; do not stop at a
one-off patch that only hides the reported symptom. Keep the work within the
requested scope, preserve established behaviour, and add regression coverage
at the lowest shared boundary so future instances are prevented.

## Verification follows the current change

Verification is triggered by work performed in the **current request**, not by
pre-existing changes in the worktree or work completed in an earlier request.

- Git-only and read-only requests - for example inspect, explain, diagnose,
  stage, commit, branch, push, or report status - do not authorize rerunning
  tests, builds, host-app screen verification, or responsive audits unless the
  user explicitly asks for them.
- If the current request changes no code, do not run tests or builds merely for
  reassurance. Use only the read-only checks needed to complete the request.
- If the current request changes code but does not change a screen or visual
  behaviour, run only proportionate code checks. Do not run host-app screen or
  responsive visual verification.
- Run screen/design verification only when the current request actually creates
  or changes a user-visible screen, layout, interaction, or responsive behaviour,
  or when the user explicitly requests visual verification.

## Pre-ship review (`ship-check`)

When I say **`ship-check`** (or "run the ship-check") on a change, answer these
four questions about the code you just wrote - honestly and specifically, not as
a rubber stamp. Point at real files/lines, name concrete risks, and if the answer
to 1 or 2 is "no", say so and propose the fix. Don't claim "secure/efficient"
without naming *what* makes it so.

1. **Did you build this in the most secure way?**
   - Authz on every new endpoint/screen (RBAC key gates the *backend* view, not
     just the FE nav). Entity/tenant scoping - can a user read/write another
     tenant's rows by changing an id or `?entity=`?
   - What does the serializer/response expose? Flag raw `JSONField`/metadata,
     PII, secrets, internal ids that didn't need to leave the server.
   - Input validation and injection surface; never trust FE-only gating.

2. **Did you build this in the most efficient way?**
   - Query cost: N+1 (`select_related`/`prefetch_related`), missing indexes,
     unbounded result sets, pagination present where lists can grow.
   - Frontend: no request-per-keystroke (debounce search), no unnecessary
     re-renders/broad selectors/polling, no added latency on the hot path.
   - Is there a simpler implementation that does the same job?

3. **What regressions could this introduce?**
   - Permission/nav gating changes (who *loses* visibility?), shared-component
     edits, tag-invalidation changes, contract/shape assumptions, migrations.
   - List the blast radius explicitly; "none" needs justifying.

4. **What tests do we need before we ship it?**
   - Backend: the security-critical cases first - permission-denied (403),
     cross-tenant isolation, then the happy path + each filter/edge.
   - Frontend: empty `{}` / populated / error / forbidden render states; any new
     mutation flow. State whether the screen was actually driven with **real
     data** in a host application or only type-checked - empty-state screenshots
     do NOT prove populated rendering.

Finish with a one-line **verdict**: ship / fix-first, and the single most
important thing to do before shipping.

## Wrapping up: report in plain words

When you finish a task - a build, an investigation, a document, a round of
decisions - close with a plain-language breakdown rather than a wall of prose.
Short numbered lines, one point each, ordinary words. Assume I am reading it tired.

Use **only** the sections that actually apply, and **skip the ones that don't** -
an empty heading is worse than no heading, and never pad a section to fill it out.

- **What you now have** - the finished things, one line each. Only if something was
  produced.
- **What you decided** - decisions taken and locked, one line each. Only if
  decisions were actually made.
- **What was fixed** - resolved defects, written in the past tense. Include only
  when knowing the original cause is useful and it has not already been explained.
- **What still needs attention** - only defects, risks, or incomplete work that
  remain after the task. Omit this section entirely when nothing remains.
- **Where to go next** - the order of the next steps, and which of them are
  unblocked right now.

That list is closed. Do not invent a heading for something that does not fit one
of them: put it under the heading it belongs to, and if it belongs under none of
them, leave it out of the breakdown entirely. A section the user did not ask for
is one they must decode before they can tell whether it needs them.

How to write it:

- Plain words beat precise jargon. "Purchases can approve themselves" lands;
  "`skip_if_no_approvers` permits terminal auto-approval" does not.
- Size things honestly in both directions - say when something feared turns out to
  be a one-line fix, and say when something small turns out to be load-bearing.
- Put the worst finding where it cannot be missed, even if that breaks the order.
- Never place resolved problems under a heading that suggests they remain broken.
  When all reported defects were fixed, say so plainly and omit any unresolved-
  findings section.
- Keep file/line references out of the breakdown; they belong in `todo.md` and in
  the detail above it.
- Don't re-explain what I already know from the conversation.

## Asking, suggesting and disputing: use a real example

When you need a decision from the user, **ask the question directly**. Do not bury
it in a paragraph, do not quietly answer it yourself and move on, and do not hand
over a list of considerations in place of the question.

Then **show the consequence with a real example** - named people, a named school,
a specific sequence of events. The example is what makes a choice obvious, so it
is not decoration and it is not optional.

This applies equally to three things:

- **questions** - what needs deciding;
- **suggestions** - something you think should be done;
- **disputes** - something you think is wrong, including a decision already taken.

Write the example the way it would actually happen:

> Bright Star School enrols Tunde and the admin mistypes his mother's address as
> `adaokeye@gmail.com`. That address belongs to a stranger who already has an
> account, because her own daughter attends Greenfield. If an attached link shows
> the full record straight away, she opens her app and sees Tunde's class, his
> fees, his home address and his father's phone number.

Not:

> Attached links may expose PII to an incorrect recipient where the email address
> is mistyped.

The second one is true and nobody can act on it. Abstractions hide the size of a
thing in both directions - they make a small risk sound alarming and a serious one
sound routine. A concrete case is the only way it can be weighed.

Keep it short. One example, the shortest one that still shows the consequence.
Where a choice has two sides, show the bad case **and** the good case, not only
the side you favour.

## Responsive views - every screen must work on phone AND desktop

Every screen in this package must render well at desktop **and** small widths - a
user switching from PC to phone must never get a broken view. Horizontal page
overflow is a bug, full stop.

Build to the house conventions, which are the consuming applications' and not
this package's alone:

- Never rely on the host's layout wrapper to absorb a wide table. The child
  wrapper carries `grid grid-cols-1 min-w-0` in both applications, and a nowrap
  table that needs more than that will stretch the page past the viewport.
- Lists: `DataTable`/`CustomTable` already render phone cards below `md`; dense
  report tables opt out per-table with `mobile="scroll"`.
- Toolbars/action rows get `flex-wrap`; tab strips `max-w-full overflow-x-auto`
  with `whitespace-nowrap` buttons; form grids `grid-cols-1 sm:grid-cols-N`;
  count-KPI strips `grid-cols-2 ... lg:grid-cols-4` (money KPIs stay 1-col on
  phones); drawers `w-full sm:max-w-[...]`; fixed side rails stack below `md`.
- In a flex row, a `flex-1` wrapper needs `min-w-0` or descendant `truncate`
  silently stops working.

**Verify from a host, not from here.** This package cannot be rendered on its
own, so a screen changed here is verified by running `console-fe` or `school-fe`
against it and driving the route there. Look at the phone screenshots: zero
overflow with a crushed side-by-side layout is still a fail. Desktop remains the
design source of truth; phone adapts by stacking, wrapping and switching to
cards, never by hiding or truncating data away.

**Depth policy - phones are view plus simple actions, not full parity.** Phone
users browse, read details, approve, and fill simple forms, and those flows must
be genuinely good. Complex multi-line creation and editing (journal entry,
invoice lines, receipt allocation, bulk editors) stays desktop-first: on a phone
it must be *usable*, with nothing broken or unreachable, but do not spend effort
redesigning it phone-first and never degrade the desktop experience to make it
fit.

## Comments: short inline, the story in the doc block

An inline comment is a label, not an explanation. Keep it to one short line that
names what the next line or block does. If the point takes more than that to
make, it does not belong inline: move it into the JSDoc block (`/** ... */`)
above the component, hook, function, type or slice it concerns, or into a block
at the top of the file when it describes the file as a whole.

The doc block is where the reasoning lives. Write it there once, properly, and
let the code below stay clean.

### Write for a stranger reading it years from now

Every comment and doc block is permanent documentation. It has to read the same
way to somebody who has never seen this branch, this milestone or this
conversation. Describe the code as it is, in the present tense, and let it
stand on its own.

That rules out:

- milestone, sprint, wave and ticket names - `M16`, `wave 3`, `the RBAC sprint`;
- change narration - "added", "changed", "moved here", "now returns", "used to";
- notes aimed at a reviewer - "note that", "as discussed", "for now",
  "temporary until we", "so you can see it working";
- time references - "recently", "since the redesign", "will be removed later".

Not this:

```tsx
// M16 flag added here so the preview tab shows up for Corona
const canPreview = useFeatureFlag("notification_preview");
```

This:

```tsx
/**
 * Template preview panel.
 *
 * Branding and locale resolve from the active tenant rather than from the
 * signed-in user, so an admin checking a template sees what the recipient
 * will see.
 */
export function TemplatePreview({ template }: TemplatePreviewProps) {
  const canPreview = useFeatureFlag("notification_preview");
```

The second version says more, and it stays true and useful long after the
milestone that prompted it is forgotten.

### What a doc block should carry

Say what the thing is for, and what a caller needs to know that the signature
and prop types do not already tell them: the invariant it keeps, the scope it
applies to, the condition that makes it render or behave differently, the reason
behind a choice that looks odd. Do not restate the props in prose, and do not
turn the doc block into a history of the file.

This applies to every comment written anywhere in the codebase, tests included,
and to every comment already sitting beside code being changed: bring it up to
this standard rather than leaving it as found.

## Writing punctuation

Do not use em dashes (Unicode U+2014) anywhere in source code, comments,
documentation, tests, or user-facing copy. Use a comma, colon, parentheses, or
an ordinary hyphen (`-`), whichever reads most naturally.

## Vocabulary: it is a **branch**, never a campus

A school site is a **branch**. That is the word the data model uses
(`Branch`, `branch_id`, `branch__isnull=True`), the word the API returns
(`branch`, `branch_name`, `scope_label`), and the word the product uses on
screen.

Never write "campus" - not in UI copy, not in comments, not in variable names,
not in commit messages, not in docs. A design prototype or a mockup that says
"campus" is using the wrong word: translate it to branch as you build. The same
goes for "site" and "location" when a branch is meant.

| Say | Not |
| --- | --- |
| Ikeja Branch | Ikeja Campus |
| All branches | All campuses |
| School-wide | Applies to the whole school (fine), "every campus" (not) |
| This branch runs the class | This campus runs the class |
| Branch admin | Campus admin |

The one exception is quoted third-party text - an error message from an
external system, or a school's own words in a support ticket. Quote those
verbatim and do not silently correct them.
