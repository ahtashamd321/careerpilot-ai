import { requireUser } from "@/lib/supabase/server";
import { Badge, Empty, PageHeader } from "@/components/ui";

export default async function ActivityPage() {
  const { supabase, user } = await requireUser();
  const { data } = await supabase.from("automation_runs").select("*").eq("user_id", user.id).order("started_at", { ascending: false }).limit(150);
  return (
    <>
      <PageHeader title="Activity log" description="Every automation run, with attempts, results and errors. Failed steps retry automatically on the next hourly check, up to twice a day." />
      {(data ?? []).length === 0 ? <Empty>No runs yet.</Empty> : (
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-line text-mist">
              <tr><th className="px-4 py-3 font-medium">Date</th><th className="px-4 py-3 font-medium">Step</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Trigger</th><th className="px-4 py-3 font-medium">Attempts</th><th className="px-4 py-3 font-medium">Details</th></tr>
            </thead>
            <tbody>
              {(data ?? []).map((r) => (
                <tr key={r.id} className="border-b border-line/60 align-top">
                  <td className="px-4 py-3 whitespace-nowrap">{r.run_date}<div className="text-xs text-mist">{new Date(r.started_at).toLocaleTimeString("en-IN", { timeStyle: "short", timeZone: "Asia/Kolkata" })} IST</div></td>
                  <td className="px-4 py-3 capitalize">{r.step}</td>
                  <td className="px-4 py-3"><Badge tone={r.status === "success" ? "good" : r.status === "failed" ? "bad" : "cyan"}>{r.status}</Badge></td>
                  <td className="px-4 py-3 text-mist">{r.trigger}</td>
                  <td className="px-4 py-3">{r.attempts}</td>
                  <td className="px-4 py-3 text-xs">
                    {r.error ? <span className="text-bad">{r.error}</span> : <code className="break-all text-mist">{JSON.stringify(r.stats)}</code>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
