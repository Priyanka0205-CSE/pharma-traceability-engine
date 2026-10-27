import jwt from "jsonwebtoken";
import { cookies } from "next/headers";

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function signToken(user) {
  return jwt.sign(
    { userId: user.user_id, role: user.role, orgId: user.org_id, name: user.full_name },
    process.env.JWT_SECRET,
    { expiresIn: "8h" }
  );
}

// Authentication: is the caller logged in?  Authorization: is their role allowed?
export function requireUser(allowedRoles) {
  const token = cookies().get("token")?.value;
  if (!token) throw new HttpError(401, "Please log in");
  let user;
  try {
    user = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    throw new HttpError(401, "Session expired, please log in again");
  }
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    throw new HttpError(403, "Your role is not allowed to do this");
  }
  return user;
}
