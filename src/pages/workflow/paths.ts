/**
 * The workflow module's own URLs.
 *
 * In the package rather than the host contract because both apps mount these
 * screens at the same addresses - ``/workflow/approvals``, ``/workflow/templates``
 * and the rest - and a contract member would be two apps agreeing to hold the
 * same nine strings and drifting the first time one of them was edited alone.
 *
 * Shaped like the apps' own ``routesPath`` so a screen reads the same here as
 * it did in the console, and so moving one back out costs a rename rather than
 * a rewrite.
 */
export const routesPath = {
  PROTECTED: {
    WORKFLOW: {
      APPROVALS: "/workflow/approvals",
      APPROVAL_DETAIL_PATH: "/workflow/approvals/:id",
      APPROVAL_DETAIL: (id: string) => `/workflow/approvals/${id}`,
      MY_SUBMISSIONS: "/workflow/my-submissions",
      SUBMISSION_DETAIL_PATH: "/workflow/my-submissions/:id",
      SUBMISSION_DETAIL: (id: string) => `/workflow/my-submissions/${id}`,
      INSTANCES: "/workflow/instances",
      INSTANCE_DETAIL_PATH: "/workflow/instances/:id",
      INSTANCE_DETAIL: (id: string) => `/workflow/instances/${id}`,
      TEAM_LOAD: "/workflow/team-load",
      DELEGATIONS: "/workflow/delegations",
      APPROVER_GROUPS: "/workflow/approver-groups",
      TEMPLATES: "/workflow/templates",
      TEMPLATE_NEW: "/workflow/templates/new",
      TEMPLATE_DETAIL_PATH: "/workflow/templates/:id",
      TEMPLATE_DETAIL: (id: string) => `/workflow/templates/${id}`,
      TEMPLATE_EDIT_PATH: "/workflow/templates/:id/edit",
      TEMPLATE_EDIT: (id: string) => `/workflow/templates/${id}/edit`,
    },
  },
} as const;
