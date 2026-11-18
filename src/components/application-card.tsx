"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ActionButton, ActionForm } from "./actions-ui";
import { deleteRow, moveApplication, saveApplication } from "@/app/actions";
import { APPLICATION_STATUSES, STATUS_LABEL, type ApplicationStatus } from "@/lib/types";

export type AppRow = {
  id: string; job_id: string | null; company: string; position: string; match_score: number | null; status: ApplicationStatus;
  applied_at: string | null; recruiter: string | null; follow_up_at: string | null; interview_at: string | null; notes: string; apply_url: string | null;
};

export function ApplicationFields({ a }: { a?: Partial<AppRow> }) {
  const local = a?.interview_at ? new Date(new Date(a.interview_at).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "";
  return (
    <div className="grid gap-2 text-sm">
      {a?.id && <input type="hidden" name="id" value={a.id} />}
      <div className="grid grid-cols-2 gap-2">
        <input name="company" defaultValue={a?.company} placeholder="Company" required className="field" aria-label="Company" />
        <input name="position" defaultValue={a?.position} placeholder="Position" required className="field" aria-label="Position" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <select name="status" defaultValue={a?.status ?? "saved"} className="field" aria-label="Status">
          {APPLICATION_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <input name="match_score" type="number" min={0} max={100} defaultValue={a?.match_score ?? ""} placeholder="Match %" className="field" aria-label="Match score" />
      </div>
      <label className="text-xs text-mist">Applied on<input name="applied_at" type="date" defaultValue={a?.applied_at ?? ""} className="field mt-1" /></label>
      <label className="text-xs text-mist">Follow up on<input name="follow_up_at" type="date" defaultValue={a?.follow_up_at ?? ""} className="field mt-1" /></label>
      <label className="text-xs text-mist">Interview<input name="interview_at" type="datetime-local" defaultValue={local} className="field mt-1" /></label>
      <input name="recruiter" defaultValue={a?.recruiter ?? ""} placeholder="Recruiter" className="field" aria-label="Recruiter" />
      <input name="apply_url" type="url" defaultValue={a?.apply_url ?? ""} placeholder="Job link" className="field" aria-label="Job link" />
      <textarea name="notes" defaultValue={a?.notes ?? ""} placeholder="Notes" rows={3} className="field" aria-label="Notes" />
    </div>
  );
}

export function ApplicationCard({ a }: { a: AppRow }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const due = a.follow_up_at && a.follow_up_at <= today && !["offer", "rejected"].includes(a.status);
  return (
    <li className="rounded-lg border border-line bg-black p-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-medium text-paper">{a.position}</div>
          <div className="truncate text-mist">{a.company}</div>
        </div>
        {a.match_score != null && <span className="font-display font-semibold text-cyan">{a.match_score}%</span>}
      </div>
      <div className="mt-2 space-y-0.5 text-xs text-mist">
        {a.applied_at && <div>Applied {a.applied_at}</div>}
        {a.interview_at && <div className="text-cyan">Interview {new Date(a.interview_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</div>}
        {a.follow_up_at && <div className={due ? "text-warn" : ""}>Follow up {a.follow_up_at}{due ? " (due)" : ""}</div>}
        {a.recruiter && <div>Recruiter: {a.recruiter}</div>}
      </div>
      <select aria-label="Move to" className="field mt-2 py-1 text-xs" value={a.status} disabled={pending}
        onChange={(e) => start(async () => { await moveApplication(a.id, e.target.value as ApplicationStatus); router.refresh(); })}>
        {APPLICATION_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
      </select>
      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-mist hover:text-cyan">Edit details</summary>
        <ActionForm action={saveApplication} className="mt-2 space-y-2">
          <ApplicationFields a={a} />
          <div className="flex items-center justify-between">
            <button className="btn-primary py-1.5">Save changes</button>
            <ActionButton action={deleteRow.bind(null, "applications", a.id)} className="text-xs text-mist hover:text-bad" confirm="Delete this application?">Delete</ActionButton>
          </div>
        </ActionForm>
      </details>
      <div className="mt-2 flex gap-3 text-xs">
        {a.job_id && <a href={`/jobs/${a.job_id}`} className="link">Match</a>}
        {a.apply_url && <a href={a.apply_url} target="_blank" rel="noopener noreferrer" className="link">Posting</a>}
      </div>
    </li>
  );
}
