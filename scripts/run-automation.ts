/**
 * Background scheduler entry point. Runs in GitHub Actions (hourly), not in the browser.
 *   npm run automation              -> run due users + publish scheduled posts
 *   npm run automation -- --force   -> run every enabled user now, ignoring today's runs
 *   npm run automation -- --user <uuid> --step jobs
 */
import { dueUsers, runAllSteps, runStep } from "../src/lib/automation";
import { publishDuePosts } from "../src/lib/linkedin";
import { adminClient } from "../src/lib/supabase/admin";
import { STEPS, type Step } from "../src/lib/types";

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const userArg = args[args.indexOf("--user") + 1];
  const stepArg = args[args.indexOf("--step") + 1] as Step | undefined;
  let failed = 0;

  const published = await publishDuePosts();
  if (published.length) console.log("Scheduled posts:", JSON.stringify(published));

  let users: string[];
  if (args.includes("--user") && userArg) users = [userArg];
  else if (force) {
    const { data } = await adminClient().from("settings").select("user_id").eq("automation_enabled", true);
    users = (data ?? []).map((d) => d.user_id);
  } else users = await dueUsers();

  console.log(`Users to process: ${users.length}`);
  for (const u of users) {
    const results = args.includes("--step") && stepArg && STEPS.includes(stepArg)
      ? [await runStep(u, stepArg, { force, trigger: "schedule" })]
      : await runAllSteps(u, { force, trigger: "schedule" });
    for (const r of results) {
      console.log(`[${u.slice(0, 8)}] ${r.step}: ${r.status}${r.error ? ` (${r.error})` : ""}${r.stats ? ` ${JSON.stringify(r.stats).slice(0, 300)}` : ""}`);
      if (r.status === "failed") failed++;
    }
  }
  // Failures are already logged in automation_runs and sent as notifications;
  // a non-zero exit also makes the GitHub Actions run show red.
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
