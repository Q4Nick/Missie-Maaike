import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import {
  CreateMissionSessionBody,
  CreateMissionSessionResponse,
  EndMissionSessionResponse,
  GetMissionStateResponse,
  SubmitMissionAnswerBody,
  SubmitMissionAnswerResponse,
} from "@workspace/api-zod";
import { db, missionAnswersTable } from "@workspace/db";
import {
  AGENTS,
  FRAGMENTS,
  PUZZLES,
  getAgent,
  norm,
  specialQuestion,
  unlockMs,
} from "../lib/mission-data";
import {
  clearMissionSession,
  getMissionIdentity,
  isSameSecret,
  setMissionSession,
  type MissionIdentity,
} from "../lib/mission-auth";

const router: IRouter = Router();
const SPECIAL_INDEX = 31;
const GROUP_GATE = Date.parse("2026-10-31T15:00:00+01:00");
const MEETUP_REVEAL = Date.parse("2026-10-31T17:45:00+01:00");
const DESTINATION_REVEAL = Date.parse("2026-10-31T18:15:00+01:00");

async function buildMissionState(identity: MissionIdentity) {
  const now = Date.now();
  const rows = await db.select().from(missionAnswersTable);
  const ownRows =
    identity.role === "agent"
      ? rows.filter((row) => row.agent === identity.agentId && row.correct)
      : [];
  const people = AGENTS.map((agent) => {
    const correctRows = rows.filter((row) => row.agent === agent.id && row.correct);
    const personalAnswer = correctRows.find((row) => row.puzzle === SPECIAL_INDEX);
    const latest = rows
      .filter((row) => row.agent === agent.id)
      .reduce<Date | null>(
        (latestDate, row) =>
          !latestDate || row.updatedAt > latestDate ? row.updatedAt : latestDate,
        null,
      );
    return {
      id: agent.id,
      label: agent.label,
      solved: correctRows
        .filter((row) => row.puzzle < PUZZLES.length)
        .map((row) => row.puzzle),
      done: Boolean(personalAnswer),
      fragment: identity.role === "admin" ? (personalAnswer?.answer ?? null) : null,
      updatedAt: latest?.toISOString() ?? null,
    };
  });
  const groupComplete = people.every((person) => person.done);
  const ownAgent = identity.role === "agent"
    ? AGENTS.find((agent) => agent.id === identity.agentId)
    : undefined;
  const rendezvous = !groupComplete
    ? {
        stage: "locked" as const,
        message: "Alle vier de agenten moeten eerst hun persoonlijke datumdeel invullen.",
        location: null,
        destination: null,
      }
    : now >= DESTINATION_REVEAL
      ? {
          stage: "destination" as const,
          message: "Nixtamal in Mijdrecht, aan de N201. Proost op Maaike!",
          location: "Nixtamal, Mijdrecht — N201",
          destination: "Nixtamal",
        }
      : now >= MEETUP_REVEAL
        ? {
            stage: "meetup" as const,
            message: "Verzamel om 17:45 bij het afgesproken punt. Reis daarna samen verder.",
            location: "Huisnummer 65, 3641 CK Mijdrecht",
            destination: null,
          }
        : {
            stage: "locked" as const,
            message: "Om 17:45 verschijnt de verzamelplaats.",
            location: null,
            destination: null,
          };

  return GetMissionStateResponse.parse({
    agent: ownAgent ? { id: ownAgent.id, label: ownAgent.label } : null,
    admin: identity.role === "admin",
    people,
    groupComplete,
    puzzles: PUZZLES.map((puzzle, index) => ({
      index,
      at: puzzle.at,
      kind: puzzle.kind,
      title: puzzle.title,
      question:
        now >= unlockMs(puzzle.at) &&
        (unlockMs(puzzle.at) <= GROUP_GATE || groupComplete)
          ? puzzle.question
          : "",
      hint:
        now >= unlockMs(puzzle.at) &&
        (unlockMs(puzzle.at) <= GROUP_GATE || groupComplete)
          ? puzzle.hint
          : "",
      solved: ownRows.some((row) => row.puzzle === index),
      available:
        now >= unlockMs(puzzle.at) &&
        (unlockMs(puzzle.at) <= GROUP_GATE || groupComplete),
    })),
    special: ownAgent && now >= GROUP_GATE ? specialQuestion(ownAgent.id) : null,
    answers:
      identity.role === "admin"
        ? rows.map((row) => ({
            agent: row.agent,
            puzzle: row.puzzle,
            answer: row.answer,
            correct: row.correct,
            updatedAt: row.updatedAt.toISOString(),
          }))
        : [],
    serverNow: new Date(now).toISOString(),
    rendezvous,
  });
}

router.post("/missie/session", async (req, res): Promise<void> => {
  const input = CreateMissionSessionBody.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: "Voer een geldige toegangscode in." });
    return;
  }

  const code = input.data.code.trim();
  const agent = getAgent(code);
  const identity: MissionIdentity | null = agent
    ? { role: "agent", agentId: agent.id }
    : isSameSecret(code, process.env.ADMIN_CODE)
      ? { role: "admin", agentId: null }
      : null;

  if (!identity) {
    res.status(401).json({ error: "Ongeldige toegangscode." });
    return;
  }

  setMissionSession(res, identity);
  const state = await buildMissionState(identity);
  res.json(CreateMissionSessionResponse.parse(state));
});

router.get("/missie/session", async (req, res): Promise<void> => {
  const identity = getMissionIdentity(req);
  if (!identity) {
    res.status(401).json({ error: "Je sessie is verlopen. Meld je opnieuw aan." });
    return;
  }
  res.json(await buildMissionState(identity));
});

router.post("/missie/session/end", (req, res): void => {
  clearMissionSession(res);
  res.json(EndMissionSessionResponse.parse({ ok: true }));
});

router.post("/missie/answers", async (req, res): Promise<void> => {
  const identity = getMissionIdentity(req);
  if (!identity || identity.role !== "agent") {
    res.status(401).json({ error: "Meld je aan met je persoonlijke agentcode." });
    return;
  }

  const input = SubmitMissionAnswerBody.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: "Controleer je antwoord en probeer opnieuw." });
    return;
  }

  const { puzzleIndex, answer } = input.data;
  const special = puzzleIndex === SPECIAL_INDEX;
  const puzzle = PUZZLES[puzzleIndex];
  if (!special && !puzzle) {
    res.status(400).json({ error: "Deze opdracht bestaat niet." });
    return;
  }

  const now = Date.now();
  const unlockAt = special ? GROUP_GATE : unlockMs(puzzle.at);
  if (now < unlockAt) {
    res.status(403).json({ error: "Deze opdracht is nog vergrendeld." });
    return;
  }

  if (!special && unlockAt > GROUP_GATE) {
    const completed = await db
      .select({ agent: missionAnswersTable.agent })
      .from(missionAnswersTable)
      .where(and(eq(missionAnswersTable.puzzle, SPECIAL_INDEX), eq(missionAnswersTable.correct, true)));
    if (!AGENTS.every((agent) => completed.some((row) => row.agent === agent.id))) {
      res.status(403).json({ error: "Wacht tot alle vier de persoonlijke datumdelen zijn ingevuld." });
      return;
    }
  }

  const agentIndex = AGENTS.findIndex((agent) => agent.id === identity.agentId);
  const expected = special ? FRAGMENTS[agentIndex] : puzzle.answer;
  const correct = norm(answer) === norm(expected);
  await db
    .insert(missionAnswersTable)
    .values({
      agent: identity.agentId,
      puzzle: puzzleIndex,
      answer: answer.slice(0, 100),
      correct,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [missionAnswersTable.agent, missionAnswersTable.puzzle],
      set: {
        answer: answer.slice(0, 100),
        correct,
        updatedAt: new Date(),
      },
    });

  res.json(
    SubmitMissionAnswerResponse.parse({
      correct,
      message: correct ? "Code geaccepteerd." : "Dat is nog niet de juiste oplossing. Probeer het opnieuw.",
    }),
  );
});

export default router;
