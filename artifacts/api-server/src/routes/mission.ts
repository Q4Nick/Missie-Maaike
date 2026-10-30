import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import {
  CreateMissionSessionBody,
  CreateMissionSessionResponse,
  EndMissionSessionResponse,
  GetMissionStateResponse,
  OpenMissionPuzzleBody,
  OpenMissionPuzzleResponse,
  SubmitMissionAnswerBody,
  SubmitMissionAnswerResponse,
} from "@workspace/api-zod";
import { db, missionAnswersTable, missionPuzzleOpensTable } from "@workspace/db";
import {
  AGENTS,
  DESTINATION_COORDINATES,
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
const MORSE_PUZZLE_INDEX = 8;
const MORSE_HINT_DELAY_MS = 5 * 60 * 1000;
const GROUP_GATE = Date.parse("2026-10-31T15:00:00+01:00");

async function buildMissionState(identity: MissionIdentity) {
  const now = Date.now();
  const rows = await db.select().from(missionAnswersTable);
  const morseOpenRows =
    identity.role === "agent"
      ? await db
          .select({ openedAt: missionPuzzleOpensTable.openedAt })
          .from(missionPuzzleOpensTable)
          .where(
            and(
              eq(missionPuzzleOpensTable.agent, identity.agentId),
              eq(missionPuzzleOpensTable.puzzle, MORSE_PUZZLE_INDEX),
            ),
          )
          .limit(1)
      : [];
  const morseOpenedAt = morseOpenRows[0]?.openedAt ?? null;
  const ownRows =
    identity.role === "agent"
      ? rows.filter((row) => row.agent === identity.agentId && row.correct)
      : [];
  const people = AGENTS.map((agent) => {
    const correctRows = rows.filter((row) => row.agent === agent.id && row.correct);
    const agentIndex = AGENTS.findIndex((candidate) => candidate.id === agent.id);
    const personalAnswer = rows.find(
      (row) =>
        row.agent === agent.id &&
        row.puzzle === SPECIAL_INDEX &&
        row.correct &&
        norm(row.answer) === norm(FRAGMENTS[agentIndex] ?? ""),
    );
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
        message: "Alle vier de agenten moeten eerst hun persoonlijke coördinaatdeel invullen.",
        location: null,
        destination: null,
      }
    : {
        stage: "destination" as const,
        message: "Alle vier de delen zijn binnen. Jullie hebben de locatie gevonden. Zorg dat jullie er om 18:15 zijn.",
        location: null,
        destination: DESTINATION_COORDINATES,
      };

  return GetMissionStateResponse.parse({
    agent: ownAgent ? { id: ownAgent.id, label: ownAgent.label } : null,
    admin: identity.role === "admin",
    people,
    groupComplete,
    puzzles: PUZZLES.map((puzzle, index) => {
      const available =
        now >= unlockMs(puzzle.at) &&
        (unlockMs(puzzle.at) <= GROUP_GATE || groupComplete);
      const morseHintReleased =
        index !== MORSE_PUZZLE_INDEX ||
        identity.role === "admin" ||
        (morseOpenedAt !== null && now >= morseOpenedAt.getTime() + MORSE_HINT_DELAY_MS);
      return {
        index,
        at: puzzle.at,
        kind: puzzle.kind,
        title: puzzle.title,
        question: available ? puzzle.question : "",
        hint: available && morseHintReleased ? puzzle.hint : "",
        solved: ownRows.some((row) => row.puzzle === index),
        available,
      };
    }),
    special: ownAgent && now >= GROUP_GATE ? specialQuestion(ownAgent.id) : null,
    answers:
      identity.role === "admin"
          ? rows.map((row) => {
              const agentIndex = AGENTS.findIndex((agent) => agent.id === row.agent);
              const isCurrentPersonalAnswer =
                row.puzzle !== SPECIAL_INDEX ||
                (row.correct && norm(row.answer) === norm(FRAGMENTS[agentIndex] ?? ""));
              return {
                agent: row.agent,
                puzzle: row.puzzle,
                answer: row.answer,
                correct: row.correct && isCurrentPersonalAnswer,
                updatedAt: row.updatedAt.toISOString(),
              };
            })
        : [],
    serverNow: new Date(Math.floor(now / 60_000) * 60_000).toISOString(),
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

router.post("/missie/puzzles/open", async (req, res): Promise<void> => {
  const identity = getMissionIdentity(req);
  if (!identity || identity.role !== "agent") {
    res.status(401).json({ error: "Meld je aan met je persoonlijke agentcode." });
    return;
  }

  const input = OpenMissionPuzzleBody.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: "Dit dossier kan niet worden geopend." });
    return;
  }

  const puzzleIndex = input.data.puzzleIndex;
  const puzzle = PUZZLES[puzzleIndex];
  if (!puzzle) {
    res.status(400).json({ error: "Dit dossier bestaat niet." });
    return;
  }

  const now = Date.now();
  const unlockAt = unlockMs(puzzle.at);
  if (now < unlockAt) {
    res.status(403).json({ error: "Dit dossier is nog vergrendeld." });
    return;
  }

  const inserted = await db
    .insert(missionPuzzleOpensTable)
    .values({ agent: identity.agentId, puzzle: puzzleIndex })
    .onConflictDoNothing()
    .returning({ openedAt: missionPuzzleOpensTable.openedAt });
  let openedAt = inserted[0]?.openedAt;
  if (!openedAt) {
    const existing = await db
      .select({ openedAt: missionPuzzleOpensTable.openedAt })
      .from(missionPuzzleOpensTable)
      .where(
        and(
          eq(missionPuzzleOpensTable.agent, identity.agentId),
          eq(missionPuzzleOpensTable.puzzle, puzzleIndex),
        ),
      )
      .limit(1);
    openedAt = existing[0]?.openedAt;
  }
  if (!openedAt) {
    res.status(500).json({ error: "De openingstijd kon niet worden opgeslagen." });
    return;
  }

  res.json(OpenMissionPuzzleResponse.parse({ openedAt: openedAt.toISOString() }));
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
