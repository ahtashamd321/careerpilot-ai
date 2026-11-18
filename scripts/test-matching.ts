import assert from "node:assert/strict";
import { scoreJob, parseExperience, extractSkills } from "../src/lib/matching";
import { DEFAULT_PROFILE } from "../src/lib/defaults";
import type { Profile } from "../src/lib/types";

const profile: Profile = { user_id: "test", ...DEFAULT_PROFILE };
function job(title: string, description: string, location: string, is_remote = false) {
  const e = parseExperience(description);
  return { title, description, location, is_remote, exp_min: e.min, exp_max: e.max, skills: extractSkills(`${title} ${description}`) };
}

// experience parsing
assert.deepEqual(parseExperience("0-1 years of experience").min, 0);
assert.equal(parseExperience("Minimum 3 years experience in analytics").min, 3);
assert.equal(parseExperience("2+ years of relevant experience").min, 2);
assert.equal(parseExperience("Freshers welcome").min, 0);
assert.equal(parseExperience("We are a 10 year old company").min, null);

const cases = [
  job("Junior Data Analyst", "0-1 years. Advanced Excel, SQL, Power BI dashboards. Any graduate.", "Noida, India"),
  job("MIS Analyst", "1-2 years experience in MIS reporting using Excel and SQL. Graduate.", "Gurugram"),
  job("Business Analyst", "2+ years of experience. SQL, Tableau, stakeholder management, JIRA. Bachelor's degree.", "Bengaluru"),
  job("Senior Data Analyst", "5+ years of experience with SQL, Python, Spark, AWS.", "Hyderabad"),
  job("Data Analyst", "Power BI, SQL, Excel. Freshers welcome.", "Remote - India", true),
  job("Data Analyst", "3+ years experience, SQL, Python, Looker.", "Berlin, Germany"),
];
for (const c of cases) {
  const r = scoreJob(c, profile);
  console.log(String(r.score).padStart(3), r.recommendation.padEnd(15), c.title, "|", c.location, JSON.stringify(r.breakdown));
}
const s = cases.map((c) => scoreJob(c, profile).score);
assert.ok(s[0] >= 80, "junior DA in Noida should be >= 80");
assert.ok(s[4] >= 80, "remote India fresher DA should be >= 80");
assert.ok(s[3] < 50, "senior 5+ should be low");
assert.ok(s[5] < 50, "Berlin 3+ should be low");
assert.ok(s[0] > s[2], "junior should beat 2+ BA");
console.log("all matching tests passed");
