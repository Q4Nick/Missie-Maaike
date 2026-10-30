import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, Check, ChevronRight, CircleHelp, Fingerprint, LockKeyhole, LogOut, RefreshCw, Send, Sparkles, Zap } from 'lucide-react';
import { getGetMissionStateQueryKey, useSubmitMissionAnswer } from '@workspace/api-client-react';
import type { MissionState } from '@workspace/api-client-react';
import { Link } from 'wouter';
import { GAMES } from '@/components/mini-games';

const MORSE_PUZZLE_INDEX = 8;

function formatClock(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return [Math.floor(total / 3600), Math.floor(total / 60) % 60, total % 60]
    .map((part) => String(part).padStart(2, '0'))
    .join(':');
}

export default function PlayerView({ mission, onLeave, leaving, onRefresh }: {
  mission: MissionState;
  onLeave: () => void;
  leaving: boolean;
  onRefresh: () => void;
}) {
  const queryClient = useQueryClient();
  const submitAnswer = useSubmitMissionAnswer();
  const current = mission.current;
  const clue = current?.clue ?? null;
  const [answer, setAnswer] = useState('');
  const [feedback, setFeedback] = useState<{ correct: boolean; text: string } | null>(null);
  const [hintShown, setHintShown] = useState(false);
  const [trainingOpen, setTrainingOpen] = useState(false);
  const [tick, setTick] = useState(() => Date.now());

  // De klok volgt de servertijd, zodat een verkeerd ingestelde telefoon niet uitmaakt.
  const offset = useRef(0);
  useEffect(() => { offset.current = Date.parse(mission.serverNow) - Date.now(); }, [mission.serverNow]);
  useEffect(() => {
    const timer = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const now = tick + offset.current;

  const unlockAt = current?.unlockAt ? Date.parse(current.unlockAt) : null;
  const hintAt = current?.hintAt ? Date.parse(current.hintAt) : null;

  // Zodra een klok op nul komt meteen de volgende stap of hint ophalen.
  const refreshedFor = useRef<number | null>(null);
  useEffect(() => {
    const due = unlockAt ?? (clue && !clue.hint ? hintAt : null);
    if (due !== null && now >= due && refreshedFor.current !== due) {
      refreshedFor.current = due;
      onRefresh();
    }
  }, [now, unlockAt, hintAt, clue, onRefresh]);

  const clueIndex = clue?.index ?? null;
  useEffect(() => {
    setHintShown(false);
    setAnswer('');
  }, [clueIndex]);

  async function sendAnswer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!clue || !answer.trim()) return;
    setFeedback(null);
    try {
      const result = await submitAnswer.mutateAsync({ data: { puzzleIndex: clue.index, answer: answer.trim() } });
      setFeedback({ correct: result.correct, text: result.correct ? 'Klopt. Het spoor loopt verder.' : 'Dat is het niet. Kijk nog eens goed.' });
    } catch {
      setFeedback({ correct: false, text: 'Dat lukte niet. Controleer je verbinding en probeer opnieuw.' });
    }
    await queryClient.invalidateQueries({ queryKey: getGetMissionStateQueryKey() });
  }

  const firstWait = current?.stage === 'waiting' && unlockAt !== null && now < Date.parse('2026-10-31T12:00:00+01:00');
  const waitingKicker = firstWait ? 'DE OPERATIE START OVER' : 'VOLGENDE AANWIJZING OVER';

  return (
    <main className="player-screen noise">
      <header className="mission-header">
        <div className="brand-lockup"><span className="brand-mark"><Fingerprint size={20} /></span><span>MISSIE<span className="brand-light"> / MAAIKE</span></span></div>
        <button className="icon-button exit-button" onClick={onLeave} disabled={leaving} aria-label="Sessie beëindigen" data-testid="button-end-session"><LogOut size={17} /><span>AFMELDEN</span></button>
      </header>
      <div className="clue-stage enter" key={current?.stage === 'clue' ? `clue-${clueIndex}` : current?.stage}>
        {current?.stage === 'waiting' && unlockAt !== null && <section className="countdown" data-testid="status-countdown">
          {feedback?.correct && <p className="clue-feedback good" role="status"><Check size={14} /> {feedback.text}</p>}
          <div className="eyebrow"><span className="eyebrow-line" /> {waitingKicker} <span className="eyebrow-line" /></div>
          <div className="countdown-clock mono" data-testid="text-countdown">{formatClock(unlockAt - now)}</div>
          {firstWait
            ? <p className="clue-lead">Niemand weet nog wat er komt. Hou deze pagina in de gaten.</p>
            : current.lead && <p className="clue-lead">{current.lead}</p>}
        </section>}

        {current?.stage === 'clue' && clue && <section className="clue-card">
          {feedback?.correct && <p className="clue-feedback good" role="status"><Check size={14} /> {feedback.text}</p>}
          {current.lead && <p className="clue-lead">{current.lead}</p>}
          <h1 className="clue-title display" id="clue-title">{clue.title}</h1>
          <p className="clue-question" data-testid="text-clue-question">{clue.question}</p>
          {clue.hint
            ? hintShown
              ? clue.index === MORSE_PUZZLE_INDEX
                ? <div className="clue-hint"><strong>Morsealfabet</strong><div className="morse-key-grid">{clue.hint.split(';').map((entry) => {
                    const [letter, code] = entry.trim().split(/\s+/);
                    if (!letter || !code) return null;
                    return <div className="morse-key-entry" key={letter}><strong>{letter}</strong><span>{code}</span></div>;
                  })}</div></div>
                : <div className="clue-hint"><strong>Hint</strong> {clue.hint}</div>
              : <button className="clue-hint-button" type="button" onClick={() => setHintShown(true)} data-testid="button-show-hint"><CircleHelp size={15} /><span>HINT TONEN</span><ChevronRight size={15} /></button>
            : hintAt !== null && now < hintAt && <p className="clue-hint-wait"><CircleHelp size={13} /> Vast? Over <span className="mono">{formatClock(hintAt - now)}</span> komt er een hint.</p>}
          <form className="clue-form" onSubmit={sendAnswer}>
            <div className="answer-entry">
              <input aria-labelledby="clue-title" data-testid="input-mission-answer" value={answer} onChange={(event) => { setAnswer(event.target.value); setFeedback(null); }} placeholder="Typ je antwoord…" maxLength={100} autoComplete="off" autoFocus />
              <button type="submit" disabled={!answer.trim() || submitAnswer.isPending} data-testid="button-submit-answer">{submitAnswer.isPending ? <RefreshCw size={17} className="spin" /> : <><span>VERSTUUR</span><Send size={15} /></>}</button>
            </div>
            {feedback && !feedback.correct && <p className="clue-feedback" role="status">{feedback.text}</p>}
          </form>
        </section>}

        {current?.stage === 'blocked' && <section className="clue-card clue-center" data-testid="status-joint-gate">
          <LockKeyhole size={24} className="clue-icon" />
          <h1 className="clue-title display">Jouw deel is binnen.</h1>
          <p className="clue-lead">Het spoor loopt pas verder als iedereen zijn deel heeft ingevuld.</p>
          <div className="team-signal">{mission.people.map((person) => <span className={person.done ? 'signal-done' : ''} key={person.id} data-testid={`status-agent-${person.id}`}>{person.done ? <Check size={12} /> : <span className="status-point" />} {person.label}</span>)}</div>
        </section>}

        {current?.stage === 'finished' && mission.rendezvous.stage === 'locked' && <section className="clue-card clue-center">
          <BadgeCheck size={24} className="clue-icon" />
          <h1 className="clue-title display">Het spoor is rond.</h1>
          <p className="clue-lead">Wacht op het teken van de missiecentrale.</p>
        </section>}

        {mission.rendezvous.stage === 'destination' && <section className="clue-card clue-reveal" data-testid="status-rendezvous">
          <div className="reveal-top"><Sparkles size={16} /><span>DE LOCATIE IS GEVONDEN</span></div>
          <p className="clue-lead">{mission.rendezvous.message}</p>
          <div className="rendezvous-location"><span>COÖRDINATEN</span><strong>{mission.rendezvous.destination}</strong></div>
          <div className="rendezvous-time"><span>AANKOMSTTIJD</span><strong>18:15</strong></div>
        </section>}

        <section className="training-toggle">
          <button type="button" onClick={() => setTrainingOpen((open) => !open)} aria-expanded={trainingOpen} data-testid="button-toggle-training"><Zap size={14} /><span>OEFEN JE INSTINCT</span><ChevronRight size={15} className={trainingOpen ? 'rotated' : ''} /></button>
        </section>
      </div>
      {trainingOpen && <nav className="training-list enter" aria-label="Oefen je instinct">
        {GAMES.map(({ slug, title, intro, icon: Icon, href }) => <Link href={href} className="training-link" key={slug} data-testid={`link-game-${slug}`}>
          <span className="game-icon"><Icon size={17} /></span><span className="training-copy"><strong>{title}</strong><small>{intro}</small></span><ChevronRight size={15} />
        </Link>)}
      </nav>}
    </main>
  );
}
