import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { query } from "@/lib/db";
import { signToken, HttpError } from "@/lib/auth";
import { handle, readJson } from "@/lib/api";

export const POST = handle(async (request) => {
  const { email, password } = await readJson(request);
  if (!email || !password) throw new HttpError(400, "Email and password are required");

  const { rows } = await query(
    "SELECT user_id, email, password_hash, full_name, role, org_id FROM users WHERE email = $1",
    [String(email).toLowerCase()]
  );
  const user = rows[0];
  const ok = user && (await bcrypt.compare(password, user.password_hash));
  if (!ok) throw new HttpError(401, "Invalid email or password");

  cookies().set("token", signToken(user), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  return { user_id: user.user_id, name: user.full_name, role: user.role, org_id: user.org_id };
});
