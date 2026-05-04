// C:\work\nextjs-server\app\dashboard\utils\profile-image.ts
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function uploadProfileImage(file: File, userId: string) {
  const ext = file.name.split(".").pop();
  const fileName = `${userId}.${ext}`;

  const { error } = await supabase.storage
    .from("profile-images")
    .upload(fileName, file, { upsert: true });

  if (error) throw error;

  const { data } = supabase.storage
    .from("profile-images")
    .getPublicUrl(fileName);

  return data.publicUrl;
}
