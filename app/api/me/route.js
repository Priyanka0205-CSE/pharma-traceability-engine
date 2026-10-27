import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/api";

export const GET = handle(async () => requireUser());
