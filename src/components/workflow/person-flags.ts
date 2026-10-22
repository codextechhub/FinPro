/**
 * Who did it, as the server words it, and whether they have left.
 *
 * An approval vote or an audit entry made while one person acted for another
 * (a proxy session) names both: Mrs Bello approved while acting as Mrs
 * Adeyemi, and the history reads "Mrs Bello for Mrs Adeyemi". The server sends
 * the sentence ready (`acted_label`) beside the two names, and sets
 * `proxied_user_name` only when there was a proxy, so an ordinary vote keeps
 * reading as the approver's own name.
 *
 * The same rows say when a person has exited (`*_is_exited`), which draws the
 * avatar outline (see `exited-person.ts`), and name each person beside their
 * id (`actor_name`, `requested_by_name`, ...). A trail is read by everyone who
 * may open the document, most of whom may not read the staff list, so these
 * sent names are what a screen shows; the id is for keys and avatar colours.
 *
 * The host applications type these rows without the newer fields, so they are
 * read here through these widened shapes rather than by editing each host.
 */

/** The proxy and exit fields a workflow vote carries. */
export interface VoteAttribution {
  actor_name?: string | null;
  on_behalf_of_name?: string | null;
  reversed_by_name?: string | null;
  proxied_by?: string | null;
  real_actor_name?: string | null;
  proxied_user_name?: string | null;
  acted_label?: string | null;
  actor_is_exited?: boolean | null;
  on_behalf_of_is_exited?: boolean | null;
  proxied_by_is_exited?: boolean | null;
}

/** The proxy and exit fields an audit row carries (workflow or finance). */
export interface AuditAttribution {
  actor_name?: string | null;
  real_actor_name?: string | null;
  proxied_user_name?: string | null;
  acted_label?: string | null;
  actor_is_exited?: boolean | null;
  effective_user_is_exited?: boolean | null;
}

/** The names an eligible-approver row carries. */
export interface ApproverNames {
  user_name?: string | null;
  on_behalf_of_name?: string | null;
}

/** The names a request row carries: who raised it, and whom a queue entry is held for. */
export interface RequestNames {
  requested_by_name?: string | null;
  on_behalf_of_name?: string | null;
}

/** Who acted, as the server words it: "X for Y" under a proxy, else the actor's name. */
export function actedBy(row: AuditAttribution | VoteAttribution | null | undefined): string | null {
  return row?.acted_label || row?.actor_name || null;
}

/** The server's "X for Y" when the act was done under a proxy, else null. */
export function proxyLabel(row: AuditAttribution | VoteAttribution | null | undefined): string | null {
  if (!row || !row.proxied_user_name) return null;
  return row.acted_label || (row.real_actor_name ? `${row.real_actor_name} for ${row.proxied_user_name}` : null);
}

/** Whether the person whose avatar a row draws has left. */
export function actorExited(row: { actor_is_exited?: boolean | null } | null | undefined): boolean {
  return row?.actor_is_exited === true;
}
