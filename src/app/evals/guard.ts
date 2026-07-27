/**
 * Route protection for the eval dashboard.
 *
 * The spec asks for read-only and behind auth if the app has auth, otherwise an
 * env flag. This app has both halves and needs both:
 *
 *   AUTH — src/middleware.ts gates every route with HTTP Basic when APP_PASSWORD
 *   is set. That covers /evals automatically. But APP_PASSWORD is OPTIONAL: unset
 *   means the app is open, which is right for local development and wrong for a
 *   deployment that has an eval dashboard on it.
 *
 *   FLAG — so the dashboard additionally requires EVAL_DASHBOARD=1. Off by
 *   default, deliberately: a route that exposes question text, model answers and
 *   judge reasoning should not appear on a deployment because someone forgot to
 *   turn it off. Opt in, not opt out.
 *
 * notFound() rather than a 403, because "this deployment has no eval dashboard"
 * and "you may not see it" should look identical from outside.
 */
import { notFound } from "next/navigation";

export function dashboardEnabled(): boolean {
  return process.env.EVAL_DASHBOARD === "1";
}

export function assertDashboardEnabled(): void {
  if (!dashboardEnabled()) notFound();
}
