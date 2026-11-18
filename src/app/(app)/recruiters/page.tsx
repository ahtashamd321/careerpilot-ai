import { requireUser } from "@/lib/supabase/server";
import { Badge, Empty, PageHeader, Panel } from "@/components/ui";
import { ActionButton, ActionForm } from "@/components/actions-ui";
import { deleteRow, saveRecruiter } from "@/app/actions";

type R = { id: string; name: string; designation: string; company: string; profile_url: string | null; source_url: string | null; hiring_interests: string; notes: string; verified: boolean; origin: string; related_job_id: string | null };

function Fields({ r }: { r?: R }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {r && <input type="hidden" name="id" value={r.id} />}
      <input name="name" defaultValue={r?.name} placeholder="Name" required className="field" aria-label="Name" />
      <input name="designation" defaultValue={r?.designation} placeholder="Designation" className="field" aria-label="Designation" />
      <input name="company" defaultValue={r?.company} placeholder="Company" required className="field" aria-label="Company" />
      <input name="profile_url" type="url" defaultValue={r?.profile_url ?? ""} placeholder="Public profile link" className="field" aria-label="Public profile link" />
      <input name="source_url" type="url" defaultValue={r?.source_url ?? ""} placeholder="Where you found them" className="field sm:col-span-2" aria-label="Source link" />
      <textarea name="hiring_interests" defaultValue={r?.hiring_interests} placeholder="What they hire for" rows={2} className="field sm:col-span-2" aria-label="Hiring interests" />
      <textarea name="notes" defaultValue={r?.notes} placeholder="Your notes" rows={2} className="field sm:col-span-2" aria-label="Notes" />
      <label className="flex items-center gap-2 text-sm text-mist"><input type="checkbox" name="verified" defaultChecked={r?.verified ?? true} className="accent-cyan" /> I checked the source</label>
    </div>
  );
}

export default async function RecruitersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const { supabase, user } = await requireUser();
  let query = supabase.from("recruiters").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
  if (q) query = query.or(`name.ilike.%${q.replace(/[%,()]/g, "")}%,company.ilike.%${q.replace(/[%,()]/g, "")}%`);
  const { data } = await query.limit(200);
  const rows = (data ?? []) as R[];

  return (
    <>
      <PageHeader title="Recruiters" description="Hiring contacts at companies that match you, from public sources only. AI finds are marked unverified until you check the source link." />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div>
          <form className="mb-4 flex gap-2"><input name="q" defaultValue={q} placeholder="Search name or company" className="field max-w-xs" aria-label="Search recruiters" /><button className="btn-ghost">Search</button></form>
          {rows.length === 0 ? <Empty>No contacts yet. They&apos;re looked up daily for companies where you score 65% or more, or add one yourself.</Empty> : (
            <ul className="space-y-3">
              {rows.map((r) => (
                <li key={r.id} className="panel p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="font-medium text-paper">{r.name}</div>
                      <div className="text-sm text-mist">{r.designation}{r.designation && r.company ? ", " : ""}{r.company}</div>
                    </div>
                    <div className="flex gap-1.5">
                      {r.verified ? <Badge tone="good">Verified</Badge> : <Badge tone="warn">Unverified</Badge>}
                      <Badge>{r.origin === "ai_search" ? "Found by search" : "Added by you"}</Badge>
                    </div>
                  </div>
                  {r.hiring_interests && <p className="mt-2 text-sm text-paper/85">{r.hiring_interests}</p>}
                  {r.notes && <p className="mt-1 text-sm text-mist">{r.notes}</p>}
                  <div className="mt-2 flex flex-wrap gap-3 text-sm">
                    {r.profile_url && <a href={r.profile_url} target="_blank" rel="noopener noreferrer" className="link">Public profile</a>}
                    {r.source_url && <a href={r.source_url} target="_blank" rel="noopener noreferrer" className="link">Source</a>}
                    {r.related_job_id && <a href={`/jobs/${r.related_job_id}`} className="link">Related job</a>}
                  </div>
                  <details className="mt-3">
                    <summary className="cursor-pointer text-sm text-mist hover:text-cyan">Edit</summary>
                    <ActionForm action={saveRecruiter} className="mt-3 space-y-3">
                      <Fields r={r} />
                      <div className="flex items-center justify-between">
                        <button className="btn-primary">Save changes</button>
                        <ActionButton action={deleteRow.bind(null, "recruiters", r.id)} confirm="Delete this contact?" className="text-sm text-mist hover:text-bad">Delete</ActionButton>
                      </div>
                    </ActionForm>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </div>
        <Panel title="Add a contact" className="h-fit">
          <ActionForm action={saveRecruiter} resetOnSuccess className="space-y-3">
            <Fields />
            <button className="btn-primary">Add contact</button>
          </ActionForm>
          <p className="mt-4 text-xs text-mist">Only save what someone has made public about their work. Emails and phone numbers are not stored.</p>
        </Panel>
      </div>
    </>
  );
}
