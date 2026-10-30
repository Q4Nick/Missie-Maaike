import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import {
  Activity, ArrowDownRight, ArrowUpRight, BadgeCheck, Brain, Check, ChevronRight,
  CircleHelp, Clock3, Fingerprint, KeyRound, LockKeyhole, LogOut, Radio,
  RefreshCw, RotateCcw, Send, Shield, Signal, Sparkles, Timer, Users, Wifi, Zap,
} from 'lucide-react';
import {
  getGetMissionStateQueryKey, useCreateMissionSession, useEndMissionSession,
  useGetMissionState, useOpenMissionPuzzle, useSubmitMissionAnswer,
} from '@workspace/api-client-react';
import type { MissionState } from '@workspace/api-client-react';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();
const MORSE_PUZZLE_INDEX = 8;

function timeLabel(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('nl-NL', { hour: '2-digit', minute: '2-digit' }).format(date);
}

function isUnauthorizedMissionError(error: unknown) {
  return typeof error === 'object' && error !== null && 'status' in error && error.status === 401;
}

function Home() {
  const queryClient = useQueryClient();
  const missionQuery = useGetMissionState({
    query: {
      queryKey: getGetMissionStateQueryKey(),
      refetchInterval: (query) => query.state.data && !isUnauthorizedMissionError(query.state.error) ? 10000 : false,
      refetchIntervalInBackground: false,
      retry: false,
    },
  });
  const createSession = useCreateMissionSession();
  const endSession = useEndMissionSession();
  const openMissionPuzzle = useOpenMissionPuzzle();
  const submitAnswer = useSubmitMissionAnswer();
  const [code, setCode] = useState('');
  const [accessError, setAccessError] = useState('');
  const [answer, setAnswer] = useState('');
  const [answerMessage, setAnswerMessage] = useState('');
  const [selectedPuzzle, setSelectedPuzzle] = useState<number | null>(null);
  const [morseHintRevealed, setMorseHintRevealed] = useState(false);
  const [manualRefreshing, setManualRefreshing] = useState(false);

  const mission = missionQuery.data;
  const isMorsePuzzleOpen = selectedPuzzle === MORSE_PUZZLE_INDEX;
  const morseStoragePrefix = mission?.agent?.id
    ? `missie-maaike:${mission.agent.id}:dossier-${MORSE_PUZZLE_INDEX}`
    : null;
  const activePuzzle = useMemo(
    () => {
      if (!mission || selectedPuzzle === null) return null;
      if (selectedPuzzle === 31) {
        return mission.special
          ? { index: 31, at: '15:00', kind: 'main' as const, title: 'Jouw persoonlijke vraag', question: mission.special, hint: '', solved: false, available: true }
          : null;
      }
      return mission.puzzles.find((puzzle) => puzzle.index === selectedPuzzle && puzzle.available) ?? null;
    },
    [mission, selectedPuzzle],
  );
  useEffect(() => {
    if (!isMorsePuzzleOpen || !morseStoragePrefix) {
      setMorseHintRevealed(false);
      return;
    }

    const revealedKey = `${morseStoragePrefix}:hint-revealed`;
    try {
      setMorseHintRevealed(window.localStorage.getItem(revealedKey) === '1');
    } catch {
      setMorseHintRevealed(false);
    }
  }, [isMorsePuzzleOpen, morseStoragePrefix]);

  const morseHintAvailable = isMorsePuzzleOpen && Boolean(activePuzzle?.hint);
  const completedCount = mission?.people.reduce((total, person) => total + person.solved.length, 0) ?? 0;
  const puzzleTotal = mission?.puzzles.length ?? 31;

  async function enterMission(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAccessError('');
    try {
      await createSession.mutateAsync({ data: { code: code.trim() } });
      setCode('');
      await queryClient.invalidateQueries({ queryKey: getGetMissionStateQueryKey() });
    } catch {
      setAccessError('Deze toegangscode wordt niet herkend. Controleer je bericht en probeer opnieuw.');
    }
  }

  async function leaveMission() {
    await endSession.mutateAsync(undefined, {
      onSuccess: async () => {
        setSelectedPuzzle(null);
        setAnswer('');
        setAnswerMessage('');
        await queryClient.resetQueries({ queryKey: getGetMissionStateQueryKey() });
      },
    });
  }

  async function refreshMissionManually() {
    setManualRefreshing(true);
    try {
      await missionQuery.refetch();
    } finally {
      setManualRefreshing(false);
    }
  }

  async function sendAnswer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activePuzzle || !answer.trim()) return;
    setAnswerMessage('');
    try {
      const result = await submitAnswer.mutateAsync({
        data: { puzzleIndex: activePuzzle.index, answer: answer.trim() },
      });
      setAnswerMessage(result.message);
      if (result.correct) setAnswer('');
      await queryClient.invalidateQueries({ queryKey: getGetMissionStateQueryKey() });
    } catch {
      setAnswerMessage('Antwoord kon niet worden verstuurd. Controleer de verbinding en probeer opnieuw.');
    }
  }

  function openDossier(index: number) {
    setSelectedPuzzle(index);
    setAnswerMessage('');
    if (index !== MORSE_PUZZLE_INDEX) return;

    openMissionPuzzle.mutate(
      { data: { puzzleIndex: MORSE_PUZZLE_INDEX } },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({ queryKey: getGetMissionStateQueryKey() });
        },
        onError: () => {
          setAnswerMessage('De opening kon niet worden opgeslagen. Controleer je verbinding en open het dossier opnieuw.');
        },
      },
    );
  }

  function revealMorseHint() {
    if (!morseStoragePrefix || !morseHintAvailable) return;
    try {
      window.localStorage.setItem(`${morseStoragePrefix}:hint-revealed`, '1');
    } catch {
      // Keep the hint available for this open drawer if browser storage is disabled.
    }
    setMorseHintRevealed(true);
  }

  if (missionQuery.isLoading && !mission) return <LoadingScreen />;
  if (!mission || isUnauthorizedMissionError(missionQuery.error)) {
    return (
      <main className="access-screen noise">
        <div className="access-orbit orbit-one" /><div className="access-orbit orbit-two" />
        <header className="access-top">
          <div className="brand-lockup"><span className="brand-mark"><Fingerprint size={21} /></span><span>MISSIE<span className="brand-light"> / MAAIKE</span></span></div>
          <div className="top-signal"><span className="pulse-dot" /> VERBINDING BESCHIKBAAR</div>
        </header>
        <section className="access-content enter">
          <div className="eyebrow"><span className="eyebrow-line" /> BESLOTEN OPERATIE <span className="eyebrow-line" /></div>
          <h1 className="access-title display">Vanavond<br /><em>is niets</em><br />toeval.</h1>
          <p className="access-copy">Vier gasten. Eén geheime opdracht.<br />Maaike rekent op jullie.</p>
          <form className="access-form" onSubmit={enterMission}>
            <label className="field-label" htmlFor="mission-code">JOUW TOEGANGSCODE</label>
            <div className="access-input-wrap">
              <KeyRound size={17} />
              <input id="mission-code" data-testid="input-access-code" value={code} onChange={(event) => setCode(event.target.value)} placeholder="Voer je code in" autoComplete="one-time-code" required maxLength={100} />
              <button className="access-submit" data-testid="button-enter-mission" type="submit" disabled={createSession.isPending || !code.trim()} aria-label="Start de missie">
                {createSession.isPending ? <RefreshCw className="spin" size={18} /> : <ChevronRight size={21} />}
              </button>
            </div>
            {accessError && <p className="form-error" role="alert">{accessError}</p>}
            <p className="form-note"><LockKeyhole size={13} /> Toegang is persoonlijk. Deel je code niet.</p>
          </form>
          <div className="access-meta">
            <span><span className="meta-number">04</span> AGENTEN</span><span className="meta-divider" /><span><span className="meta-number">31</span> DOSSIERS</span><span className="meta-divider" /><span><span className="meta-number">01</span> GEHEIM</span>
          </div>
        </section>
        <footer className="access-footer"><span>MISSIE MAAIKE <span className="mono">/ 01</span></span><span className="mono">ALLEEN VOOR GENODIGDEN</span></footer>
      </main>
    );
  }

  if (mission.admin) return (
    <AdminRoom mission={mission} onLeave={leaveMission} leaving={endSession.isPending} onRefresh={refreshMissionManually} refreshing={manualRefreshing} />
  );

  const agent = mission.agent;
  const player = mission.people.find((person) => person.id === agent?.id);
  const solvedSet = new Set(player?.solved ?? []);
  const isBonus = activePuzzle?.kind === 'bonus';
  return (
    <main className="player-screen noise">
      <header className="mission-header">
        <div className="brand-lockup"><span className="brand-mark"><Fingerprint size={20} /></span><span>MISSIE<span className="brand-light"> / MAAIKE</span></span></div>
        <div className="header-center"><span className="pulse-dot" /> LIVE OPERATIE <span className="header-clock mono">{timeLabel(mission.serverNow)}</span></div>
        <button className="icon-button exit-button" onClick={leaveMission} disabled={endSession.isPending} aria-label="Sessie beëindigen" data-testid="button-end-session"><LogOut size={17} /><span>AFMELDEN</span></button>
      </header>
      <div className="player-shell">
        <aside className="player-rail">
          <div className="agent-card">
            <div className="agent-avatar">{agent?.label.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'AG'}</div>
            <div><div className="agent-caption">INGELOGD ALS</div><div className="agent-name" data-testid="text-agent-name">{agent?.label ?? 'Agent'}</div></div>
            <Signal size={15} className="agent-signal" />
          </div>
          <div className="rail-section-label">OPERATIE STATUS</div>
          <div className="progress-panel">
            <div className="progress-count"><strong>{player?.solved.length ?? 0}</strong><span>/{puzzleTotal}</span></div>
            <p>Dossiers afgehandeld</p>
            <div className="progress-track"><span style={{ width: `${Math.min(100, ((player?.solved.length ?? 0) / Math.max(1, puzzleTotal)) * 100)}%` }} /></div>
            <div className="progress-foot"><span>PERSOONLIJKE VOORTGANG</span><Activity size={14} /></div>
          </div>
          <div className="rail-section-label team-label">TEAM / 04</div>
          <div className="team-list">
            {mission.people.map((person, index) => (
              <div className={`team-row ${person.id === agent?.id ? 'team-self' : ''}`} key={person.id} data-testid={`status-agent-${person.id}`}>
                <div className={`team-avatar avatar-${index}`}>{person.label.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</div>
                <div className="team-info"><strong>{person.label}{person.id === agent?.id ? ' (jij)' : ''}</strong><span>{person.done ? 'ALLE DOSSIERS BINNEN' : `${person.solved.length} DOSSIERS BINNEN`}</span></div>
                <span className={`team-state ${person.done ? 'state-done' : ''}`}>{person.done ? <Check size={13} /> : <span />}</span>
              </div>
            ))}
          </div>
          <div className="shared-progress">
            <div className="shared-icon"><Users size={17} /></div>
            <div><span>GEDEELDE OPERATIE</span><strong>{completedCount} <i>/ {Math.max(1, mission.people.length * puzzleTotal)}</i></strong></div>
            <ArrowUpRight size={15} />
          </div>
          <p className="rail-footnote"><Wifi size={13} /> VOORTGANG WORDT LIVE GESYNCHRONISEERD</p>
        </aside>
        <section className="player-main">
          <div className="welcome-row">
            <div><div className="eyebrow left"><span className="eyebrow-line" /> PERSOONLIJK DOSSIER</div><h1 className="welcome-title display">Goedenavond, <em>{agent?.label.split(' ')[0] ?? 'agent'}.</em></h1><p className="welcome-sub">Je missie is actief. De rest ontvouwt zich op het juiste moment.</p></div>
            <div className="mission-clock"><span><Clock3 size={14} /> SERVER-TIJD</span><strong className="mono">{timeLabel(mission.serverNow)}</strong></div>
          </div>
          <div className={`personal-alert ${mission.special ? 'personal-released' : ''}`} data-testid="status-personal-dossier">
              <div className="alert-icon"><Clock3 size={20} /></div>
              <div className="alert-body"><span>PERSOONLIJKE VRAAG <b>· 15:00</b></span><strong>{player?.done ? 'Vraag afgehandeld' : mission.special ? 'Jouw opdracht is vrijgegeven' : 'Nog niet vrijgegeven'}</strong><p>{player?.done ? 'Je persoonlijke dossier is binnen.' : mission.special ? mission.special : 'De missiecentrale geeft deze vraag vrij om 15:00.'}</p></div>
              <button className="text-action" onClick={() => { setSelectedPuzzle(31); setAnswerMessage(''); }} disabled={!mission.special || player?.done} data-testid="button-open-personal-question">{player?.done ? 'AFGEHANDELD' : mission.special ? 'OPENEN' : 'VERGRENDELD'} <ChevronRight size={15} /></button>
          </div>
          <div className="section-heading">
            <div><div className="eyebrow left"><span className="eyebrow-line" /> HET ARCHIEF</div><h2>Dossiers <span className="section-count">{mission.puzzles.length || '—'}</span></h2></div>
            <div className="archive-legend"><span className="legend-mark solved-mark"><Check size={10} /></span> AFGEROND <span className="legend-mark current-mark" /> BESCHIKBAAR</div>
          </div>
          <div className="dossier-grid">
            {mission.puzzles.filter((puzzle) => puzzle.index !== 31).map((puzzle, index) => {
              const solved = solvedSet.has(puzzle.index);
              const isSelected = selectedPuzzle === puzzle.index;
              return <button className={`dossier-card ${solved ? 'dossier-solved' : ''} ${isSelected ? 'dossier-selected' : ''} ${!puzzle.available ? 'dossier-locked' : ''}`} key={puzzle.index} disabled={!puzzle.available} onClick={() => openDossier(puzzle.index)} data-testid={`button-open-puzzle-${puzzle.index}`}>
                <span className="dossier-top"><span className="dossier-number">{String(puzzle.index).padStart(2, '0')}</span>{solved ? <span className="dossier-status completed"><Check size={12} /> BINNEN</span> : !puzzle.available ? <span className="dossier-status locked-label"><LockKeyhole size={11} /> VERGRENDELD</span> : <span className="dossier-status"><span className="status-point" /> {puzzle.kind === 'bonus' ? 'BONUS' : puzzle.at}</span>}</span>
                <strong>{puzzle.title}</strong><span className="dossier-kind">{puzzle.kind === 'bonus' ? 'EXTRA OPERATIE' : 'GECLASSIFICEERD DOSSIER'}</span>
                <span className="dossier-bottom"><span>{solved ? 'DOSSIER GESLOTEN' : puzzle.available ? 'DOSSIER OPENEN' : 'WACHT OP VRIJGAVE'}</span>{puzzle.available && <ChevronRight size={15} />}</span>
                <span className="card-index mono">{String(index + 1).padStart(2, '0')} / {String(mission.puzzles.length).padStart(2, '0')}</span>
              </button>;
            })}
            {mission.puzzles.length === 0 && <div className="empty-archive"><LockKeyhole size={20} /><div><strong>Archief nog niet vrijgegeven</strong><span>De server opent nieuwe dossiers zodra de missie verdergaat.</span></div></div>}
          </div>
          <section className={`joint-gate ${mission.groupComplete ? 'gate-open' : ''}`} data-testid="status-joint-gate">
            <div className="gate-symbol">{mission.groupComplete ? <BadgeCheck size={22} /> : <LockKeyhole size={21} />}</div>
            <div className="gate-copy"><span>GEZAMENLIJKE ONTGRENDELING</span><strong>{mission.groupComplete ? 'De gezamenlijke poort is geopend.' : 'De laatste deur opent alleen samen.'}</strong><p>{mission.groupComplete ? 'Alle signalen zijn binnen. De finale informatie staat hieronder.' : 'Vier individuele dossiers. Eén gezamenlijke sleutel. Blijf elkaars voortgang volgen.'}</p></div>
            <div className="gate-meter"><span>{mission.people.filter((person) => person.done).length}<i> / {mission.people.length}</i></span><small>AGENTEN GEREED</small></div>
          </section>
          <RendezvousCard rendezvous={mission.rendezvous} />
          <MiniGames />
        </section>
      </div>
      {activePuzzle && <div className="drawer-backdrop" onClick={() => setSelectedPuzzle(null)}>
        <section className="puzzle-drawer" role="dialog" aria-modal="true" aria-labelledby="puzzle-title" onClick={(event) => event.stopPropagation()}>
          <div className="drawer-grip" />
          <div className="drawer-topline"><span className="drawer-classification">{selectedPuzzle === 31 ? 'PERSOONLIJKE VRAAG' : isBonus ? 'EXTRA OPERATIE' : 'GECLASSIFICEERD DOSSIER'} <i>·</i> {activePuzzle.at}</span><button className="drawer-close" onClick={() => setSelectedPuzzle(null)} aria-label="Sluiten" data-testid="button-close-puzzle">×</button></div>
          <div className="drawer-number mono">DOSSIER {String(activePuzzle.index).padStart(2, '0')}</div>
          <h2 id="puzzle-title" className="drawer-title display">{activePuzzle.title}</h2>
          <div className="question-box"><span>OPDRACHT</span><p>{activePuzzle.question}</p></div>
          {isMorsePuzzleOpen ? !solvedSet.has(activePuzzle.index) && <div className="morse-hint-area" aria-live="polite">
            {morseHintRevealed ? <div className="hint-box morse-hint-box">
              <CircleHelp size={16} />
              <div className="morse-key-content">
                <strong>Volledig Morsealfabet</strong>
                <div className="morse-key-grid">
                  {activePuzzle.hint.split(';').map((entry) => {
                    const [letter, code] = entry.trim().split(/\s+/);
                    if (!letter || !code) return null;
                    return <div className="morse-key-entry" key={letter}><strong>{letter}</strong><span>{code}</span></div>;
                  })}
                </div>
              </div>
            </div> : morseHintAvailable && <button className="morse-hint-button" type="button" onClick={revealMorseHint}>
              <CircleHelp size={16} /><span>HINT TONEN</span><ChevronRight size={15} />
            </button>}
          </div> : activePuzzle.hint && <div className="hint-box"><CircleHelp size={16} /><p><strong>Hint</strong> {activePuzzle.hint}</p></div>}
          {solvedSet.has(activePuzzle.index) ? <div className="solved-banner"><BadgeCheck size={18} /><span>Dit dossier is door jou afgehandeld.</span></div> : <form className="answer-form" onSubmit={sendAnswer}>
            <label className="field-label" htmlFor="answer-entry">JOUW ANTWOORD</label>
            <div className="answer-entry"><input id="answer-entry" data-testid="input-mission-answer" value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="Typ je antwoord…" maxLength={100} autoComplete="off" /><button type="submit" disabled={!answer.trim() || submitAnswer.isPending} data-testid="button-submit-answer">{submitAnswer.isPending ? <RefreshCw size={17} className="spin" /> : <><span>VERSTUUR</span><Send size={15} /></>}</button></div>
            {answerMessage && <p className={`answer-feedback ${answerMessage.toLocaleLowerCase().includes('goed') || answerMessage.toLocaleLowerCase().includes('correct') ? 'feedback-success' : ''}`} role="status">{answerMessage}</p>}
          </form>}
          <div className="drawer-bottom"><Shield size={14} /> Antwoorden worden direct gecontroleerd door de missiecentrale.</div>
        </section>
      </div>}
    </main>
  );
}

function LoadingScreen() {
  return <main className="loading-screen"><div className="loading-mark"><Fingerprint size={25} /></div><span className="mono">VEILIGE VERBINDING MET MISSIECENTRALE</span><div className="loading-bars"><i /><i /><i /><i /><i /></div></main>;
}

function RendezvousCard({ rendezvous }: { rendezvous: MissionState['rendezvous'] }) {
  const isLocked = rendezvous.stage === 'locked';
  const isMeetup = rendezvous.stage === 'meetup';
  const isDestination = rendezvous.stage === 'destination';
  const title = isLocked ? 'Rendez-vous vergrendeld' : isMeetup ? 'Tijd voor de ontmoeting' : 'De locatie is gevonden';
  const reveal = isMeetup ? rendezvous.location : rendezvous.stage === 'destination' ? rendezvous.destination : null;
  return <section className={`final-reveal rendezvous-card ${isLocked ? 'rendezvous-locked' : ''}`} data-testid="status-rendezvous">
    <div className="reveal-top">{isLocked ? <LockKeyhole size={16} /> : <Sparkles size={16} />}<span>{isLocked ? 'GEZAMENLIJKE ONTGRENDELING' : isMeetup ? 'RENDEZ-VOUS · MEETUP' : 'RENDEZ-VOUS · FINALE'}</span></div>
    <h2 className="display">{title}</h2>
    <p>{rendezvous.message}</p>
    {reveal && <div className="rendezvous-location"><span>{isMeetup ? 'MEETUP-LOCATIE' : 'RESTAURANTCOÖRDINATEN'}</span><strong>{reveal}</strong></div>}
    {isDestination && <div className="rendezvous-time"><span>AANKOMSTTIJD</span><strong>18:15</strong></div>}
  </section>;
}

const memorySymbols = ['△', '○', '◇', '□', '⌘', '＋'];

function shuffledMemoryDeck() {
  return [...memorySymbols, ...memorySymbols]
    .map((symbol, index) => ({ symbol, key: `${symbol}-${index}` }))
    .sort(() => Math.random() - 0.5);
}

function MiniGames() {
  const [deck, setDeck] = useState(shuffledMemoryDeck);
  const [flipped, setFlipped] = useState<number[]>([]);
  const [matched, setMatched] = useState<number[]>([]);
  const [turns, setTurns] = useState(0);
  const [reactionPhase, setReactionPhase] = useState<'idle' | 'waiting' | 'ready' | 'early' | 'result'>('idle');
  const [reactionMs, setReactionMs] = useState<number | null>(null);
  const [bestReaction, setBestReaction] = useState<number | null>(null);
  const reactionTimer = useRef<number | null>(null);
  const reactionStartedAt = useRef(0);
  const [code, setCode] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [codePhase, setCodePhase] = useState<'idle' | 'showing' | 'input' | 'result'>('idle');
  const [codeResult, setCodeResult] = useState('');
  const [memoryMessage, setMemoryMessage] = useState('');

  useEffect(() => () => {
    if (reactionTimer.current !== null) window.clearTimeout(reactionTimer.current);
  }, []);
  useEffect(() => {
    if (flipped.length !== 2) return;
    const [first, second] = flipped;
    if (deck[first]?.symbol === deck[second]?.symbol) {
      const timeout = window.setTimeout(() => {
        setMatched((current) => [...current, first, second]);
        setFlipped([]);
        if (matched.length + 2 === deck.length) setMemoryMessage('Alle paren gevonden. Goed werk.');
      }, 440);
      return () => window.clearTimeout(timeout);
    }
    const timeout = window.setTimeout(() => setFlipped([]), 850);
    return () => window.clearTimeout(timeout);
  }, [deck, flipped, matched.length]);
  useEffect(() => {
    if (codePhase !== 'showing') return;
    const timeout = window.setTimeout(() => setCodePhase('input'), 2600);
    return () => window.clearTimeout(timeout);
  }, [codePhase, code]);

  function flipCard(index: number) {
    if (flipped.length === 2 || flipped.includes(index) || matched.includes(index)) return;
    setMemoryMessage('');
    setFlipped((current) => [...current, index]);
    if (flipped.length === 1) setTurns((current) => current + 1);
  }
  function resetMemory() {
    setDeck(shuffledMemoryDeck());
    setFlipped([]);
    setMatched([]);
    setTurns(0);
    setMemoryMessage('');
  }
  function startReaction() {
    if (reactionTimer.current !== null) window.clearTimeout(reactionTimer.current);
    setReactionMs(null);
    setReactionPhase('waiting');
    reactionTimer.current = window.setTimeout(() => {
      reactionStartedAt.current = Date.now();
      setReactionPhase('ready');
    }, 1300 + Math.floor(Math.random() * 2200));
  }
  function hitReaction() {
    if (reactionPhase === 'waiting') {
      if (reactionTimer.current !== null) window.clearTimeout(reactionTimer.current);
      reactionTimer.current = null;
      setReactionPhase('early');
    } else if (reactionPhase === 'ready') {
      const elapsed = Math.max(1, Date.now() - reactionStartedAt.current);
      setReactionMs(elapsed);
      setBestReaction((best) => best === null ? elapsed : Math.min(best, elapsed));
      setReactionPhase('result');
    }
  }
  function startCodeMemory() {
    const nextCode = String(1000 + Math.floor(Math.random() * 9000));
    setCode(nextCode);
    setCodeInput('');
    setCodeResult('');
    setCodePhase('showing');
  }
  function submitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const correct = codeInput === code;
    setCodeResult(correct ? 'Code bevestigd. Geheugen intact.' : 'Code niet bevestigd. Probeer het nog eens.');
    setCodePhase('result');
  }
  const reactionCopy = reactionPhase === 'waiting' ? 'WACHT OP HET SIGNAAL…' : reactionPhase === 'ready' ? 'NU — TIK!' : reactionPhase === 'early' ? 'TE VROEG. PROBEER OPNIEUW.' : reactionPhase === 'result' && reactionMs !== null ? `${reactionMs} MS` : 'KLAAR VOOR DE TEST?';

  return <section className="minigames" data-testid="section-mini-games">
    <div className="minigame-heading"><div><div className="eyebrow left"><span className="eyebrow-line" /> TRAININGSMODULES</div><h2>Oefen je instinct.</h2><p>Drie korte tests. Alleen voor jou, los van de missievoortgang.</p></div><span className="practice-tag"><Zap size={13} /> OEFENMODUS</span></div>
    <div className="minigame-grid">
      <article className="minigame-card memory-game" data-testid="game-memory-pairs">
        <div className="game-card-head"><span className="game-icon"><Brain size={17} /></span><span className="game-code mono">TEST 01</span></div>
        <h3>Geheugenparen</h3><p>Vind de zes bij elkaar horende symbolen.</p>
        <div className="memory-board">
          {deck.map((card, index) => {
            const isShown = flipped.includes(index) || matched.includes(index);
            return <button className={`memory-tile ${isShown ? 'tile-revealed' : ''} ${matched.includes(index) ? 'tile-matched' : ''}`} key={card.key} onClick={() => flipCard(index)} aria-label={isShown ? `Symbool ${card.symbol}` : `Kaart ${index + 1}, verborgen`} data-testid={`button-memory-card-${index}`} disabled={matched.includes(index) || flipped.length === 2}>
              {isShown ? card.symbol : <span>{String(index + 1).padStart(2, '0')}</span>}
            </button>;
          })}
        </div>
        <div className="game-footer"><span>{memoryMessage || `${matched.length / 2} / 6 PAREN · ${turns} BEURTEN`}</span><button onClick={resetMemory} data-testid="button-reset-memory" aria-label="Geheugenparen opnieuw beginnen"><RotateCcw size={14} /></button></div>
      </article>
      <article className="minigame-card reaction-game" data-testid="game-reaction-time">
        <div className="game-card-head"><span className="game-icon"><Timer size={17} /></span><span className="game-code mono">TEST 02</span></div>
        <h3>Reactietest</h3><p>Tik pas zodra het signaal omslaat.</p>
        <button className={`reaction-target reaction-${reactionPhase}`} onClick={hitReaction} disabled={reactionPhase === 'idle' || reactionPhase === 'result' || reactionPhase === 'early'} data-testid="button-reaction-target">
          <span className="reaction-orbit" /><strong>{reactionCopy}</strong><small>{reactionPhase === 'ready' ? 'TIK OM JE TIJD TE METEN' : reactionPhase === 'waiting' ? 'BLIJF GEFIXEERD' : 'REACTIEVERMOGEN'}</small>
        </button>
        <div className="game-footer"><span>{bestReaction ? `BESTE TIJD · ${bestReaction} MS` : 'BESTE TIJD · —'}</span><button onClick={startReaction} disabled={reactionPhase === 'waiting' || reactionPhase === 'ready'} data-testid="button-start-reaction">{reactionPhase === 'idle' ? 'START TEST' : reactionPhase === 'waiting' || reactionPhase === 'ready' ? 'BEZIG…' : 'OPNIEUW'} <ChevronRight size={13} /></button></div>
      </article>
      <article className="minigame-card code-game" data-testid="game-four-digit-memory">
        <div className="game-card-head"><span className="game-icon"><KeyRound size={17} /></span><span className="game-code mono">TEST 03</span></div>
        <h3>Vier cijfers</h3><p>Onthoud de code voordat hij verdwijnt.</p>
        <div className={`code-display ${codePhase === 'showing' ? 'code-visible' : ''}`} aria-live="polite">
          {codePhase === 'showing' ? code.split('').map((digit, index) => <span key={index}>{digit}</span>) : codePhase === 'idle' ? <span className="code-placeholder">— — — —</span> : <span className="code-placeholder">? ? ? ?</span>}
        </div>
        {codePhase === 'input' || codePhase === 'result' ? <form className="code-entry" onSubmit={submitCode}>
          <input aria-label="Voer de vier cijfers in" data-testid="input-four-digit-code" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} value={codeInput} onChange={(event) => setCodeInput(event.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="4 cijfers" disabled={codePhase === 'result'} />
          {codePhase === 'input' && <button type="submit" disabled={codeInput.length !== 4} data-testid="button-submit-four-digit">CONTROLEER</button>}
        </form> : <button className="code-start" onClick={startCodeMemory} data-testid="button-start-four-digit">{codePhase === 'showing' ? 'ONTHOUD DE CODE' : 'START TEST'} <ChevronRight size={13} /></button>}
        {codeResult && <p className={`code-feedback ${codeResult.startsWith('Code bevestigd') ? 'good' : ''}`} role="status">{codeResult}</p>}
        {codePhase === 'result' && <button className="code-retry" onClick={startCodeMemory} data-testid="button-retry-four-digit">OPNIEUW PROBEREN <RotateCcw size={12} /></button>}
        {codePhase === 'idle' && <div className="game-footer code-foot"><span>GEEN MISSIEVOORTGANG</span><span>LOCAL</span></div>}
      </article>
    </div>
  </section>;
}

function AdminRoom({ mission, onLeave, leaving, onRefresh, refreshing }: {
  mission: MissionState;
  onLeave: () => void;
  leaving: boolean;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const totalSolved = mission.people.reduce((total, person) => total + person.solved.length, 0);
  const totalPossible = Math.max(1, mission.people.length * (mission.puzzles.length || 31));
  const solvedAnswers = mission.answers.filter((item) => item.correct).length;
  const allDone = mission.people.filter((person) => person.done).length;
  return <main className="admin-screen noise">
    <header className="admin-header"><div className="brand-lockup"><span className="brand-mark"><Fingerprint size={20} /></span><span>MISSIE<span className="brand-light"> / MAAIKE</span></span></div><div className="control-badge"><span className="pulse-dot" /> CONTROLEKAMER</div><div className="admin-actions"><span className="server-time mono"><Clock3 size={14} /> {timeLabel(mission.serverNow)}</span><button className="icon-button" onClick={onRefresh} disabled={refreshing} data-testid="button-refresh-admin"><RefreshCw size={16} className={refreshing ? 'spin' : ''} /><span>VERVERS</span></button><button className="icon-button exit-button" onClick={onLeave} disabled={leaving} data-testid="button-end-session"><LogOut size={16} /><span>AFMELDEN</span></button></div></header>
    <div className="admin-content">
      <div className="admin-title-row"><div><div className="eyebrow left"><span className="eyebrow-line" /> LIVE OVERZICHT</div><h1 className="display">Controle<span>kamer.</span></h1><p>Vier agenten. Een avond die zich live ontvouwt.</p></div><div className="admin-status"><span className="pulse-dot" /> MISSIE ACTIEF<strong className="mono">{timeLabel(mission.serverNow)}</strong></div></div>
      <div className="metric-strip">
        <div className="metric"><span>AGENTEN AAN BOORD</span><strong>{mission.people.length.toString().padStart(2, '0')}</strong><small><Users size={14} /> Verbonden aan deze operatie</small></div>
        <div className="metric"><span>DOSSIERS AFGEHANDELD</span><strong>{totalSolved.toString().padStart(2, '0')}<i> / {totalPossible}</i></strong><small><Activity size={14} /> Totaal over alle agenten</small></div>
        <div className="metric"><span>AGENTEN GEREED</span><strong>{allDone.toString().padStart(2, '0')}<i> / {mission.people.length}</i></strong><small><BadgeCheck size={14} /> Persoonlijke eindstatus</small></div>
        <div className="metric metric-highlight"><span>GEZAMENLIJKE POORT</span><strong>{mission.groupComplete ? 'OPEN' : 'DICHT'}</strong><small>{mission.groupComplete ? <><ArrowUpRight size={14} /> Finale vrijgegeven</> : <><LockKeyhole size={14} /> Wacht op het team</>}</small></div>
      </div>
      <section className="admin-panel">
        <div className="panel-heading"><div><span className="eyebrow left"><span className="eyebrow-line" /> PERSOONLIJKE VOORTGANG</span><h2>Agenten op het veld</h2></div><span className="live-tag"><span className="pulse-dot" /> LIVE</span></div>
        <div className="agent-table">
          <div className="table-head"><span>AGENT</span><span>DOSSIERS</span><span>VOORTGANG</span><span>STATUS</span><span>LAATSTE SIGNAAL</span></div>
          {mission.people.map((person, index) => {
            const percent = Math.min(100, (person.solved.length / Math.max(1, mission.puzzles.length || 31)) * 100);
            return <div className="agent-table-row" key={person.id} data-testid={`row-agent-${person.id}`}>
              <div className="table-agent"><div className={`team-avatar avatar-${index}`}>{person.label.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</div><strong>{person.label}</strong></div>
              <strong className="table-count mono">{person.solved.length.toString().padStart(2, '0')}<i> / {mission.puzzles.length || 31}</i></strong>
              <div className="table-progress"><span><i style={{ width: `${percent}%` }} /></span><small>{Math.round(percent)}%</small></div>
              <span className={`table-status ${person.done ? 'done' : ''}`}>{person.done ? <><Check size={13} /> GEREED</> : <><span className="status-point" /> ACTIEF</>}</span>
              <span className="table-signal mono">{timeLabel(person.updatedAt)}</span>
            </div>;
          })}
          {mission.people.length === 0 && <div className="empty-admin"><Users size={20} /><span>Nog geen agenten aan boord.</span></div>}
        </div>
      </section>
      <div className="admin-lower-grid">
        <section className="admin-panel activity-panel"><div className="panel-heading compact"><div><span className="eyebrow left"><span className="eyebrow-line" /> ONDERSCHEPTE SIGNALEN</span><h2>Antwoordlog</h2></div><span className="log-count mono">{mission.answers.length.toString().padStart(2, '0')} REGELS</span></div>
          <div className="answer-log">{mission.answers.slice(-8).reverse().map((item, index) => <div className="log-row" key={`${item.agent}-${item.puzzle}-${item.updatedAt}-${index}`}><span className={`log-result ${item.correct ? 'log-correct' : 'log-wrong'}`}>{item.correct ? <Check size={12} /> : <ArrowDownRight size={12} />}</span><div className="log-main"><strong>{mission.people.find((person) => person.id === item.agent)?.label ?? item.agent}</strong><span>DOSSIER {String(item.puzzle).padStart(2, '0')} · {item.correct ? 'ANTWOORD AANVAARD' : 'ANTWOORD NIET AANVAARD'}</span></div><time className="mono">{timeLabel(item.updatedAt)}</time></div>)}
            {mission.answers.length === 0 && <div className="empty-log"><Radio size={19} /><strong>De lijn is nog stil.</strong><span>Inkomende antwoorden verschijnen hier.</span></div>}
          </div>
        </section>
        <section className="admin-panel operation-panel"><div className="panel-heading compact"><div><span className="eyebrow left"><span className="eyebrow-line" /> MISSIE-ARCHIEF</span><h2>Operatieoverzicht</h2></div><Shield size={18} className="panel-icon" /></div>
          <div className="operation-stats"><div><span>TOTAAL CORRECT</span><strong>{solvedAnswers.toString().padStart(2, '0')}</strong></div><div><span>DOSSIERS</span><strong>{mission.puzzles.length.toString().padStart(2, '0')}</strong></div></div>
          <div className="operation-progress"><div><span>GEDEELDE VOORTGANG</span><strong>{Math.round((totalSolved / totalPossible) * 100)}%</strong></div><div className="progress-track"><span style={{ width: `${(totalSolved / totalPossible) * 100}%` }} /></div></div>
          <div className={`reveal-status ${mission.rendezvous.stage !== 'locked' ? 'revealed' : ''}`} data-testid="status-rendezvous-admin"><div>{mission.rendezvous.stage === 'locked' ? <LockKeyhole size={16} /> : <Sparkles size={17} />}</div><span><strong>{mission.rendezvous.stage === 'locked' ? 'Rendez-vous vergrendeld' : mission.rendezvous.stage === 'meetup' ? 'Meetup vrijgegeven' : 'Eindbestemming vrijgegeven'}</strong><small>{mission.rendezvous.message}</small></span></div>
          {mission.rendezvous.stage !== 'locked' && <div className="admin-special"><span>{mission.rendezvous.stage === 'meetup' ? 'MEETUP-LOCATIE' : 'RESTAURANTCOÖRDINATEN'}</span><strong>{mission.rendezvous.stage === 'meetup' ? mission.rendezvous.location : mission.rendezvous.destination}</strong>{mission.rendezvous.stage === 'destination' && <><span>AANKOMSTTIJD</span><strong>18:15</strong></>}</div>}
        </section>
      </div>
      <footer className="admin-footer"><span>MISSIE MAAIKE <i>/ CONTROL ROOM</i></span><span><Wifi size={13} /> SYNCHRONISATIE OM DE 3 SECONDEN</span></footer>
    </div>
  </main>;
}

function Router() {
  return (
    // Keep a shared shell (sidebar, navbar) outside the boundary so it
    // survives a page crash.
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Home} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
