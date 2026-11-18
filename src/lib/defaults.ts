import type { Profile, Settings } from "./types";

// Seeded on first sign-in. Everything is editable on the Profile page.
export const DEFAULT_PROFILE: Omit<Profile, "user_id"> = {
  full_name: "Ahtasham Anjum",
  location: "India",
  education: "Bachelor's in Corporate Management (2024)",
  education_level: "bachelor",
  certifications: ["Data Analytics"],
  experience: [
    {
      role: "Customer Relationship Manager",
      company: "Piramal Finance",
      years: 1,
      kind: "non_analytics",
      description: "Customer relationship management in a lending business. Not a data analyst role.",
    },
  ],
  skills: [
    "Advanced Excel", "SQL", "SQL JOINs", "SQL Window Functions", "Power BI", "Tableau",
    "Python", "Data Cleaning", "Data Analysis", "Dashboard Development", "Business Reporting",
  ],
  projects: [
    { name: "Retail Analytics", description: "Sales and category performance analysis", tools: ["Power BI", "SQL", "Excel"] },
    { name: "Employee Analytics", description: "HR attrition and workforce analysis", tools: ["Power BI", "Excel"] },
    { name: "Electric Vehicle Analytics", description: "EV adoption and market analysis", tools: ["Tableau", "SQL"] },
    { name: "Online Retail Analysis", description: "Customer and order analysis of an online store", tools: ["Python", "SQL"] },
    { name: "Loan Risk Analysis", description: "Default risk patterns in loan data", tools: ["SQL", "Power BI", "Excel"] },
  ],
  target_roles: [
    "Data Analyst", "Junior Data Analyst", "MIS Analyst", "Reporting Analyst",
    "Business Analyst", "BI Analyst", "Operations Analyst",
  ],
  preferred_locations: [
    "Remote India", "Delhi NCR", "Delhi", "Noida", "Gurugram", "Gurgaon", "Bengaluru", "Bangalore",
    "Hyderabad", "Pune", "Mumbai", "Bihar", "Patna",
  ],
  summary:
    "Data analytics fresher with a Data Analytics certification and five portfolio projects, plus one year of customer-facing work as a Customer Relationship Manager at Piramal Finance.",
};

export const DEFAULT_SETTINGS: Omit<Settings, "user_id"> = {
  automation_enabled: true,
  run_hour_ist: 8,
  match_threshold: 80,
  posts_per_day: 3,
  notify_in_app: true,
  notify_browser: true,
  notify_telegram: false,
  telegram_chat_id: null,
  research_topics: [
    "data analytics trends",
    "Power BI update",
    "Microsoft Excel new features",
    "SQL analytics",
    "Python data analysis",
    "hiring data analysts India",
    "companies hiring business analysts India",
  ],
  job_queries: [
    "data analyst", "junior data analyst", "MIS analyst", "reporting analyst",
    "business analyst", "power bi analyst", "BI analyst", "operations analyst",
  ],
  sources: { greenhouse: [], lever: [], ashby: [], remotive: true, adzuna: true, jooble: true },
  max_job_age_days: 30,
};
