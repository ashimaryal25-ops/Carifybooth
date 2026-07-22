import { NextRequest, NextResponse } from "next/server";

type MirrorRole = "kiosk" | "mirror";
type MirrorEvent = {
  id: number;
  target: MirrorRole;
  type: string;
  [key: string]: unknown;
};

type MirrorRelay = {
  nextId: number;
  events: MirrorEvent[];
};

const globalRelay = globalThis as typeof globalThis & {
  cardifyMirrorRelay?: MirrorRelay;
};

const relay = globalRelay.cardifyMirrorRelay ?? { nextId: 1, events: [] };
globalRelay.cardifyMirrorRelay = relay;

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const role = request.nextUrl.searchParams.get("role") as MirrorRole | null;
  const since = Number(request.nextUrl.searchParams.get("since") ?? 0);

  if (role !== "kiosk" && role !== "mirror") {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const events = relay.events.filter((event) => event.target === role && event.id > since);
  return NextResponse.json({ events }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as Record<string, unknown>;
  const target = body.target as MirrorRole | undefined;
  const type = typeof body.type === "string" ? body.type : "";

  if ((target !== "kiosk" && target !== "mirror") || !type) {
    return NextResponse.json({ error: "Invalid event" }, { status: 400 });
  }

  // Keep only the latest of these high-frequency / single-value events so the 40-slot
  // buffer never fills with stale frames or heartbeats (hands-frame is Ghost Runner's
  // live camera feed relayed from the mirror at ~10fps).
  if (type === "captured-photo" || type === "hands-frame" || type === "hands-stream-start") {
    relay.events = relay.events.filter((event) => event.type !== type);
  }

  const event: MirrorEvent = { ...body, id: relay.nextId++, target, type };
  relay.events.push(event);
  relay.events = relay.events.slice(-40);

  return NextResponse.json({ id: event.id });
}
