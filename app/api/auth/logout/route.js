import { cookies } from "next/headers";
import { handle } from "@/lib/api";

export const POST = handle(async () => {
  cookies().delete("token");
  return { ok: true };
});
