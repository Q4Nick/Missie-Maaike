import { useState, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import Sudoku from '@/pages/sudoku';
import GamePage from '@/pages/game';
import PlayerView from '@/components/player-view';
import {
  Activity, ArrowDownRight, ArrowUpRight, BadgeCheck, Check, ChevronRight, Clock3, Fingerprint,
  KeyRound, LockKeyhole, LogOut, Radio, RefreshCw, Shield, Sparkles, Users, Wifi,
} from 'lucide-react';
import {
  getGetMissionStateQueryKey, useCreateMissionSession, useEndMissionSession,
  useGetMissionState,
} from '@workspace/api-client-react';
import type { MissionState } from '@workspace/api-client-react';
import {
  Link,
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();

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

function MissionHome({ adminEntry }: { adminEntry: boolean }) {
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
  const [code, setCode] = useState('');
  const [accessError, setAccessError] = useState('');
  const [manualRefreshing, setManualRefreshing] = useState(false);

  const mission = missionQuery.data;

  async function enterMission(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAccessError('');
    try {
      const session = await createSession.mutateAsync({ data: { code: code.trim() } });
      if (adminEntry && !session.admin) {
        await endSession.mutateAsync(undefined);
        setCode('');
        setAccessError('Deze code hoort bij een speler, niet bij de adminomgeving.');
        return;
      }
      setCode('');
      await queryClient.invalidateQueries({ queryKey: getGetMissionStateQueryKey() });
    } catch {
      setAccessError(adminEntry ? 'De admincode wordt niet herkend. Controleer de code en probeer opnieuw.' : 'Deze toegangscode wordt niet herkend. Controleer je bericht en probeer opnieuw.');
    }
  }

  async function leaveMission() {
    await endSession.mutateAsync(undefined, {
      onSuccess: async () => {
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
          <Link className="eyebrow admin-entry" href={adminEntry ? '/' : '/admin'} data-testid="link-admin-entry"><span className="eyebrow-line" /> BESLOTEN OPERATIE <span className="eyebrow-line" /></Link>
          <h1 className="access-title display">{adminEntry ? <>Admin<br /><em>omgeving.</em></> : <>Vanavond<br /><em>is niets</em><br />toeval.</>}</h1>
          <p className="access-copy">{adminEntry ? 'Log in met de admincode om de missie te beheren.' : <>Vier gasten. Eén geheime opdracht.<br />Maaike rekent op jullie.</>}</p>
          <form className="access-form" onSubmit={enterMission}>
            <label className="field-label" htmlFor="mission-code">{adminEntry ? 'ADMIN-TOEGANGSCODE' : 'JOUW TOEGANGSCODE'}</label>
            <div className="access-input-wrap">
              <KeyRound size={17} />
              <input id="mission-code" data-testid="input-access-code" type={adminEntry ? 'password' : 'text'} value={code} onChange={(event) => setCode(event.target.value)} placeholder={adminEntry ? 'Voer de admincode in' : 'Voer je code in'} autoComplete={adminEntry ? 'current-password' : 'one-time-code'} required maxLength={100} />
              <button className="access-submit" data-testid="button-enter-mission" type="submit" disabled={createSession.isPending || !code.trim()} aria-label="Start de missie">
                {createSession.isPending ? <RefreshCw className="spin" size={18} /> : <ChevronRight size={21} />}
              </button>
            </div>
            {accessError && <p className="form-error" role="alert">{accessError}</p>}
            <p className="form-note"><LockKeyhole size={13} /> Toegang is persoonlijk. Deel je code niet.</p>
          </form>
          <div className="access-meta">
            <span><span className="meta-number">04</span> AGENTEN</span><span className="meta-divider" /><span><span className="meta-number">01</span> GEHEIM</span>
          </div>
        </section>
        <footer className="access-footer"><span>MISSIE MAAIKE <span className="mono">/ 01</span></span><span className="mono">ALLEEN VOOR GENODIGDEN</span></footer>
      </main>
    );
  }

  if (mission.admin) return (
    <AdminRoom mission={mission} onLeave={leaveMission} leaving={endSession.isPending} onRefresh={refreshMissionManually} refreshing={manualRefreshing} />
  );

  return <PlayerView mission={mission} onLeave={leaveMission} leaving={endSession.isPending} onRefresh={() => missionQuery.refetch()} />;
}

function LoadingScreen() {
  return <main className="loading-screen"><div className="loading-mark"><Fingerprint size={25} /></div><span className="mono">VEILIGE VERBINDING MET MISSIECENTRALE</span><div className="loading-bars"><i /><i /><i /><i /><i /></div></main>;
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
        <Route path="/admin" component={AdminLoginRoute} />
        <Route path="/sudoku" component={Sudoku} />
        <Route path="/oefen/:slug" component={GamePage} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function Home() {
  return <MissionHome adminEntry={false} />;
}

function AdminLoginRoute() {
  return <MissionHome adminEntry />;
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
