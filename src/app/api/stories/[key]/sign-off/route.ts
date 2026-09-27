// POST /api/stories/:key/sign-off: the lead signs a story off as Ready.
// The only route that changes a story's state, and it goes through the lifecycle's guarded
// signOff (ADR-007, ADR-013). No route makes a story Ready any other way.
import { cookies } from "next/headers";
import { VIEWING_AS_COOKIE, currentActorId } from "@/server/actor";
import { prisma } from "@/server/db";
import { signOffStory } from "@/server/lifecycle";

export async function POST(_request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const people = (await prisma.person.findMany()).map((p) => ({ ...p, role: p.role as never }));
  // Signing off needs someone named: no falling back to a default person.
  const named = (await cookies()).get(VIEWING_AS_COOKIE)?.value;
  if (!named || !people.some((p) => p.id === named)) {
    return Response.json({ reasons: ["Say who is signing off (viewing as)"] }, { status: 401 });
  }
  const actorId = await currentActorId(people);
  const story = await prisma.story.findUnique({ where: { key } });
  if (!story) return Response.json({ reasons: [`No story ${key}`] }, { status: 404 });
  if (actorId !== story.leadId) {
    const lead = people.find((p) => p.id === story.leadId)?.name ?? story.leadId;
    return Response.json({ reasons: [`${lead} is the lead`] }, { status: 403 });
  }
  const result = await signOffStory(prisma, story.id, actorId);
  if (!result.ok) return Response.json({ reasons: result.reasons }, { status: 409 });
  return Response.json({ key, state: result.story.state, signedOffBy: result.story.signedOffBy });
}
