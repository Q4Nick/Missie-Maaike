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
  LEADS,
  PUZZLES,
  getAgent,
  norm,
  specialQuestion,
  unlockMs,
} from "../lib/mission-data";
import { GROUP_GATE, SPECIAL_INDEX, missionStep } from "../lib/mission-flow";
import {
  clearMissionSession,
  getMissionIdentity,
  isSameSecret,
  setMissionSession,
  type MissionIdentity,
} from "../lib/mission-auth";

const router: IRouter = Router();
const HINT_DELAY_MS = 5 * 60 * 1000;
const DESTINATION_RELEASE = Date.parse("2026-10-31T17:45:00+01:00");

function personalDone(rows: { agent: string; puzzle: number; answer: string; correct: boolean }[], agentId: string) {
  const agentIndex = AGENTS.findIndex((agent) => agent.id === agentId);
  return rows.some(
    (row) =>
      row.agent === agentId &&
      row.puzzle === SPECIAL_INDEX &&
      row.correct &&
      norm(row.answer) === norm(FRAGMENTS[agentIndex] ?? ""),
  );
}

function stepForAgent(rows: (typeof missionAnswersTable.$inferSelect)[], agentId: string, now: number) {
  return missionStep({
    now,
    solved: new Set(
      rows
        .filter((row) => row.agent === agentId && row.correct && row.puzzle < PUZZLES.length)
        .map((row) => row.puzzle),
    ),
    personalDone: personalDone(rows, agentId),
    groupComplete: AGENTS.every((agent) => personalDone(rows, agent.id)),
  });
}

// De eerste keer dat een clue wordt getoond start de teller voor de hint.
async function clueOpenedAt(agentId: string, puzzle: number) {
  const inserted = await db
    .insert(missionPuzzleOpensTable)
    .values({ agent: agentId, puzzle })
    .onConflictDoNothing()
    .returning({ openedAt: missionPuzzleOpensTable.openedAt });
  if (inserted[0]) return inserted[0].openedAt;
  const existing = await db
    .select({ openedAt: missionPuzzleOpensTable.openedAt })
    .from(missionPuzzleOpensTable)
    .where(and(eq(missionPuzzleOpensTable.agent, agentId), eq(missionPuzzleOpensTable.puzzle, puzzle)))
    .limit(1);
  return existing[0]?.openedAt ?? new Date();
}

async function buildCurrent(agentId: string, rows: (typeof missionAnswersTable.$inferSelect)[], now: number) {
  const step = stepForAgent(rows, agentId, now);
  if (step.stage === "finished") return { stage: step.stage, lead: null, clue: null, unlockAt: null, hintAt: null };
  if (step.stage === "blocked") return { stage: step.stage, lead: null, clue: null, unlockAt: null, hintAt: null };
  if (step.stage === "waiting") {
    return {
      stage: step.stage,
      lead: step.index === null ? null : (LEADS[step.index] ?? null),
      clue: null,
      unlockAt: new Date(step.unlockAt).toISOString(),
      hintAt: null,
    };
  }
  if (step.index === SPECIAL_INDEX) {
    return {
      stage: step.stage,
      lead: "Dit is de stap die jullie alleen samen kunnen zetten. Ieder heeft een eigen stukje, en zonder alle vier komt niemand verder.",
      clue: {
        index: SPECIAL_INDEX,
        title: "Jouw deel van de code",
        question: specialQuestion(agentId),
        hint: "",
        personal: true,
      },
      unlockAt: null,
      hintAt: null,
    };
  }
  const puzzle = PUZZLES[step.index];
  const hintAt = (await clueOpenedAt(agentId, step.index)).getTime() + HINT_DELAY_MS;
  return {
    stage: step.stage,
    lead: LEADS[step.index] ?? null,
    clue: {
      index: step.index,
      title: puzzle.title,
      question: puzzle.question,
      hint: now >= hintAt ? puzzle.hint : "",
      personal: false,
    },
    unlockAt: null,
    hintAt: new Date(hintAt).toISOString(),
  };
}

async function buildMissionState(identity: MissionIdentity) {
  const now = Date.now();
  const rows = await db.select().from(missionAnswersTable);
  const isAdmin = identity.role === "admin";
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
      // Agenten krijgen geen tellingen: niemand mag zien hoeveel clues er zijn of nog komen.
      solved: isAdmin
        ? correctRows.filter((row) => row.puzzle < PUZZLES.length).map((row) => row.puzzle)
        : [],
      done: Boolean(personalAnswer),
      fragment: isAdmin ? (personalAnswer?.answer ?? null) : null,
      updatedAt: isAdmin ? (latest?.toISOString() ?? null) : null,
    };
  });
  const groupComplete = people.every((person) => person.done);
  const ownAgent = identity.role === "agent"
    ? AGENTS.find((agent) => agent.id === identity.agentId)
    : undefined;
  // De coördinaten komen na de laatste clue, en uiterlijk om 17:45 voor wie nog bezig is.
  const destinationReleased =
    groupComplete &&
    (identity.role === "admin" ||
      now >= DESTINATION_RELEASE ||
      stepForAgent(rows, identity.agentId, now).stage === "finished");
  const rendezvous = !destinationReleased
    ? {
        stage: "locked" as const,
        message: groupComplete
          ? "Alle vier de delen zijn binnen. De locatie blijft nog verborgen tot het spoor is afgelegd of tot 17:45."
          : "Alle vier de agenten moeten eerst hun persoonlijke coördinaatdeel invullen.",
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
    puzzles: isAdmin
      ? PUZZLES.map((puzzle, index) => {
          const available =
            now >= unlockMs(puzzle.at) &&
            (unlockMs(puzzle.at) <= GROUP_GATE || groupComplete);
          return {
            index,
            at: puzzle.at,
            kind: puzzle.kind,
            title: puzzle.title,
            question: available ? puzzle.question : "",
            hint: available ? puzzle.hint : "",
            solved: false,
            available,
          };
        })
      : [],
    special: null,
    current: identity.role === "agent" ? await buildCurrent(identity.agentId, rows, now) : null,
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

  // Alleen de clue waar de agent nu staat telt; zo kan niemand vooruit antwoorden.
  const step = stepForAgent(await db.select().from(missionAnswersTable), identity.agentId, Date.now());
  if (step.stage !== "clue" || step.index !== puzzleIndex) {
    res.status(403).json({ error: "Deze aanwijzing is niet actief." });
    return;
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
