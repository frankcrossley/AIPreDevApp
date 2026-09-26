// "Viewing as" (ADR-003): who is acting, from a cookie. No auth in the prototype.
import { cookies } from "next/headers";
import type { Person } from "@/domain/types";

export const VIEWING_AS_COOKIE = "viewing-as";

/** The person a cookie names, or the default: the first product person, else the first person. */
export function resolveActor(cookieValue: string | undefined, people: Person[]): Person {
  const named = people.find((p) => p.id === cookieValue);
  const fallback = people.find((p) => p.role === "product") ?? people[0];
  if (!named && !fallback) throw new Error("No people in the workspace");
  return named ?? fallback;
}

export async function currentActorId(people: Person[]): Promise<string> {
  const jar = await cookies();
  return resolveActor(jar.get(VIEWING_AS_COOKIE)?.value, people).id;
}
