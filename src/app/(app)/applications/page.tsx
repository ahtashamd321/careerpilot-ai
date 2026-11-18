import { requireUser } from "@/lib/supabase/server";
import { PageHeader, Panel } from "@/components/ui";
import { ActionForm } from "@/components/actions-ui";
import { ApplicationCard, ApplicationFields, type AppRow } from "@/components/application-card";
import { saveApplication } from "@/app/actions";
import { APPLICATION_STATUSES, STATUS_LABEL } from "@/lib/types";

export default async function ApplicationsPage() {
  const { supabase, user } = await requireUser();
  const { data } = await supabase.from("applications").select("*").eq("user_id", user.id).order("updated_at", { ascending: false });
  const rows = (data ?? []) as AppRow[];

  return (
    <>
      <PageHeader title="Applications" description="Track every application from saved to offer. Move a card with its status menu." />
      <div className="-mx-4 overflow-x-auto px-4 pb-4">
        <div className="grid min-w-[1100px] grid-cols-7 gap-3">
          {APPLICATION_STATUSES.map((s) => {
            const col = rows.filter((r) => r.status === s);
            return (
              <section key={s} aria-label={STATUS_LABEL[s]} className="panel p-3">
                <h2 className="mb-3 flex items-center justify-between text-sm font-semibold">
                  {STATUS_LABEL[s]} <span className="text-mist">{col.length}</span>
                </h2>
                <ul className="space-y-2">{col.map((a) => <ApplicationCard key={a.id} a={a} />)}</ul>
              </section>
            );
          })}
        </div>
      </div>
      <Panel title="Add an application" className="mt-6 max-w-xl">
        <ActionForm action={saveApplication} resetOnSuccess className="space-y-3">
          <ApplicationFields />
          <button className="btn-primary">Add application</button>
        </ActionForm>
      </Panel>
    </>
  );
}
