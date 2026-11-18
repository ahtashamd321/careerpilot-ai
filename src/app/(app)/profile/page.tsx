import { requireUser } from "@/lib/supabase/server";
import { loadProfileAndSettings } from "@/lib/data";
import { PageHeader } from "@/components/ui";
import { ProfileForm } from "@/components/profile-form";

export default async function ProfilePage() {
  const { supabase, user } = await requireUser();
  const { profile } = await loadProfileAndSettings(supabase, user.id);
  return (
    <>
      <PageHeader title="Profile" description="Everything matching, posts and cover letters are based on. Saving re-scores all stored jobs." />
      <ProfileForm profile={profile} />
    </>
  );
}
