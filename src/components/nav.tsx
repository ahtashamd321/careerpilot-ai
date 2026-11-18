"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { BrainCircuit, Briefcase, FileText, Kanban, LayoutDashboard, Newspaper, PenLine, Settings, UserRound, Users, Activity } from "lucide-react";

const ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/jobs", label: "Jobs", icon: Briefcase },
  { href: "/applications", label: "Applications", icon: Kanban },
  { href: "/posts", label: "LinkedIn posts", icon: PenLine },
  { href: "/research", label: "Research", icon: Newspaper },
  { href: "/recruiters", label: "Recruiters", icon: Users },
  { href: "/reports", label: "Daily reports", icon: FileText },
  { href: "/memory", label: "Memory", icon: BrainCircuit },
  { href: "/activity", label: "Activity log", icon: Activity },
  { href: "/profile", label: "Profile", icon: UserRound },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="flex gap-1 overflow-x-auto lg:flex-col">
      {ITEMS.map(({ href, label, icon: Icon }) => {
        const active = path === href || path.startsWith(`${href}/`);
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined}
            className={clsx("flex shrink-0 items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
              active ? "bg-cyan/10 text-cyan" : "text-mist hover:bg-raised hover:text-paper")}>
            <Icon size={17} aria-hidden />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
