"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addBoard, removeBoard } from "@/app/actions";

type Kind = "greenhouse" | "lever" | "ashby";
const HINT: Record<Kind, string> = {
  greenhouse: "boards.greenhouse.io/NAME or job-boards.greenhouse.io/NAME",
  lever: "jobs.lever.co/NAME",
  ashby: "jobs.ashbyhq.com/NAME",
};

export function BoardManager({ boards }: { boards: Record<Kind, string[]> }) {
  const [kind, setKind] = useState<Kind>("greenhouse");
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  return (
    <div>
      <p className="text-sm text-mist">Add companies that post jobs on these applicant-tracking systems. Their public job feeds are complete and official, so closed roles drop off automatically. Find the name in the company&apos;s careers URL: {HINT[kind]}.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <select aria-label="Board type" className="field max-w-[150px]" value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
          <option value="greenhouse">Greenhouse</option><option value="lever">Lever</option><option value="ashby">Ashby</option>
        </select>
        <input aria-label="Board name" className="field max-w-xs" value={name} onChange={(e) => setName(e.target.value)} placeholder="Company board name or URL" />
        <button type="button" className="btn-primary" disabled={pending || !name.trim()} onClick={() => start(async () => {
          const r = await addBoard(kind, name);
          setMsg(r.ok ? { ok: true, text: r.message ?? "Added." } : { ok: false, text: r.error });
          if (r.ok) setName("");
          router.refresh();
        })}>{pending ? "Checking…" : "Check and add"}</button>
      </div>
      {msg && <p role="status" className={msg.ok ? "mt-2 text-sm text-good" : "mt-2 text-sm text-bad"}>{msg.text}</p>}
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {(Object.keys(boards) as Kind[]).map((k) => (
          <div key={k} className="rounded-lg border border-line p-3">
            <div className="mb-2 text-sm font-semibold capitalize">{k}</div>
            {boards[k].length === 0 ? <p className="text-xs text-mist">None added.</p> : (
              <ul className="space-y-1">
                {boards[k].map((b) => (
                  <li key={b} className="flex items-center justify-between text-sm">
                    <span>{b}</span>
                    <button type="button" className="text-xs text-mist hover:text-bad" onClick={() => start(async () => { await removeBoard(k, b); router.refresh(); })}>Remove</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
