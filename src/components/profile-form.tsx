"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { saveProfile } from "@/app/actions";
import type { ExperienceEntry, Profile, Project } from "@/lib/types";

const split = (s: string) => s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);

export function ProfileForm({ profile }: { profile: Profile }) {
  const [p, setP] = useState(profile);
  const [skills, setSkills] = useState(profile.skills.join(", "));
  const [roles, setRoles] = useState(profile.target_roles.join(", "));
  const [locs, setLocs] = useState(profile.preferred_locations.join(", "));
  const [certs, setCerts] = useState(profile.certifications.join(", "));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const setExp = (i: number, patch: Partial<ExperienceEntry>) => setP({ ...p, experience: p.experience.map((e, k) => (k === i ? { ...e, ...patch } : e)) });
  const setProj = (i: number, patch: Partial<Project>) => setP({ ...p, projects: p.projects.map((e, k) => (k === i ? { ...e, ...patch } : e)) });

  return (
    <form
      className="space-y-8"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveProfile({
            full_name: p.full_name, location: p.location, education: p.education, education_level: p.education_level, summary: p.summary,
            certifications: split(certs), skills: split(skills), target_roles: split(roles), preferred_locations: split(locs),
            experience: p.experience.filter((x) => x.role.trim()), projects: p.projects.filter((x) => x.name.trim()),
          });
          setMsg(r.ok ? { ok: true, text: r.message ?? "Saved." } : { ok: false, text: r.error });
          router.refresh();
        });
      }}
    >
      <section className="panel grid gap-4 p-5 md:grid-cols-2">
        <h2 className="text-lg font-semibold md:col-span-2">About you</h2>
        <label className="label">Name<input className="field mt-1" value={p.full_name} onChange={(e) => setP({ ...p, full_name: e.target.value })} /></label>
        <label className="label">Location<input className="field mt-1" value={p.location} onChange={(e) => setP({ ...p, location: e.target.value })} /></label>
        <label className="label">Education<input className="field mt-1" value={p.education} onChange={(e) => setP({ ...p, education: e.target.value })} /></label>
        <label className="label">Highest level
          <select className="field mt-1" value={p.education_level} onChange={(e) => setP({ ...p, education_level: e.target.value as Profile["education_level"] })}>
            <option value="bachelor">Bachelor&apos;s</option><option value="master">Master&apos;s</option><option value="diploma">Diploma</option><option value="other">Other</option>
          </select>
        </label>
        <label className="label md:col-span-2">Certifications<input className="field mt-1" value={certs} onChange={(e) => setCerts(e.target.value)} /></label>
        <label className="label md:col-span-2">Short summary (used in posts and cover letters)<textarea rows={3} className="field mt-1" value={p.summary} onChange={(e) => setP({ ...p, summary: e.target.value })} /></label>
      </section>

      <section className="panel p-5">
        <h2 className="text-lg font-semibold">Work experience</h2>
        <p className="mb-4 mt-1 text-sm text-mist">Only roles marked as analytics count as analyst experience when jobs are scored. Your CRM role stays marked as non-analytics so it&apos;s never overstated.</p>
        <div className="space-y-3">
          {p.experience.map((e, i) => (
            <div key={i} className="grid gap-2 rounded-lg border border-line p-3 md:grid-cols-[1.4fr_1.2fr_90px_170px_auto]">
              <input aria-label="Role" className="field" value={e.role} placeholder="Role" onChange={(x) => setExp(i, { role: x.target.value })} />
              <input aria-label="Company" className="field" value={e.company} placeholder="Company" onChange={(x) => setExp(i, { company: x.target.value })} />
              <input aria-label="Years" type="number" step="0.5" min={0} className="field" value={e.years} onChange={(x) => setExp(i, { years: Number(x.target.value) })} />
              <select aria-label="Kind" className="field" value={e.kind} onChange={(x) => setExp(i, { kind: x.target.value as ExperienceEntry["kind"] })}>
                <option value="non_analytics">Not analytics</option><option value="analytics">Analytics role</option>
              </select>
              <button type="button" className="btn text-mist hover:text-bad" onClick={() => setP({ ...p, experience: p.experience.filter((_, k) => k !== i) })}>Remove</button>
            </div>
          ))}
        </div>
        <button type="button" className="btn-ghost mt-3" onClick={() => setP({ ...p, experience: [...p.experience, { role: "", company: "", years: 0, kind: "non_analytics" }] })}>Add role</button>
      </section>

      <section className="panel grid gap-4 p-5">
        <h2 className="text-lg font-semibold">Skills and targets</h2>
        <label className="label">Skills<textarea rows={2} className="field mt-1" value={skills} onChange={(e) => setSkills(e.target.value)} /></label>
        <label className="label">Target roles<textarea rows={2} className="field mt-1" value={roles} onChange={(e) => setRoles(e.target.value)} /></label>
        <label className="label">Preferred locations<textarea rows={2} className="field mt-1" value={locs} onChange={(e) => setLocs(e.target.value)} /></label>
      </section>

      <section className="panel p-5">
        <h2 className="mb-4 text-lg font-semibold">Projects</h2>
        <div className="space-y-3">
          {p.projects.map((pr, i) => (
            <div key={i} className="grid gap-2 rounded-lg border border-line p-3 md:grid-cols-[1fr_1.6fr_1fr_auto]">
              <input aria-label="Project name" className="field" value={pr.name} onChange={(x) => setProj(i, { name: x.target.value })} />
              <input aria-label="Description" className="field" value={pr.description} onChange={(x) => setProj(i, { description: x.target.value })} />
              <input aria-label="Tools" className="field" value={pr.tools.join(", ")} onChange={(x) => setProj(i, { tools: split(x.target.value) })} />
              <button type="button" className="btn text-mist hover:text-bad" onClick={() => setP({ ...p, projects: p.projects.filter((_, k) => k !== i) })}>Remove</button>
            </div>
          ))}
        </div>
        <button type="button" className="btn-ghost mt-3" onClick={() => setP({ ...p, projects: [...p.projects, { name: "", description: "", tools: [] }] })}>Add project</button>
      </section>

      <div className="flex items-center gap-4">
        <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : "Save profile and re-score jobs"}</button>
        {msg && <span role="status" className={clsx("text-sm", msg.ok ? "text-good" : "text-bad")}>{msg.text}</span>}
      </div>
    </form>
  );
}
