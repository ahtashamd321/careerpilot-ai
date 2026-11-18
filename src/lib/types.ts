export type ExperienceEntry = {
  role: string;
  company: string;
  years: number;
  kind: "analytics" | "non_analytics";
  description?: string;
};
export type Project = { name: string; description: string; tools: string[] };

export type Profile = {
  user_id: string;
  full_name: string;
  location: string;
  education: string;
  education_level: "bachelor" | "master" | "diploma" | "other";
  certifications: string[];
  experience: ExperienceEntry[];
  skills: string[];
  projects: Project[];
  target_roles: string[];
  preferred_locations: string[];
  summary: string;
};

export type Sources = {
  greenhouse: string[];
  lever: string[];
  ashby: string[];
  remotive: boolean;
  adzuna: boolean;
  jooble: boolean;
};

export type Settings = {
  user_id: string;
  automation_enabled: boolean;
  run_hour_ist: number;
  match_threshold: number;
  posts_per_day: number;
  notify_in_app: boolean;
  notify_browser: boolean;
  notify_telegram: boolean;
  telegram_chat_id: string | null;
  research_topics: string[];
  job_queries: string[];
  sources: Sources;
  max_job_age_days: number;
};

export type RawJob = {
  title: string;
  company: string;
  location: string;
  is_remote: boolean;
  description: string;
  salary?: string | null;
  posted_at?: string | null;
  apply_url: string;
  source: string;
  source_ref?: string | null;
};

export type ScoreBreakdown = {
  skills: number;
  experience: number;
  education: number;
  role: number;
  location: number;
  entry: number;
};

export type MatchResult = {
  score: number;
  rawScore: number;
  capNote: string | null;
  breakdown: ScoreBreakdown;
  matchedSkills: string[];
  missingSkills: string[];
  strengths: string[];
  gaps: string[];
  eligibility: "eligible" | "stretch" | "likely_ineligible";
  eligibilityNote: string;
  recommendation: "apply_now" | "apply_tailored" | "stretch" | "skip";
  recommendationText: string;
};

export const APPLICATION_STATUSES = [
  "saved", "to_apply", "applied", "assessment", "interview", "offer", "rejected",
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];
export const STATUS_LABEL: Record<ApplicationStatus, string> = {
  saved: "Saved", to_apply: "To apply", applied: "Applied", assessment: "Assessment",
  interview: "Interview", offer: "Offer", rejected: "Rejected",
};

export const STEPS = ["research", "jobs", "recruiters", "posts", "report"] as const;
export type Step = (typeof STEPS)[number];
