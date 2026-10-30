import { useEffect, useState, type ReactNode } from 'react';
import { Link, useParams } from 'wouter';
import { ChevronLeft, Maximize, Minimize } from 'lucide-react';
import { GAMES } from '@/components/mini-games';
import NotFound from '@/pages/not-found';

// Niet elke browser kent volledig scherm (iPhone-Safari niet); dan blijft de knop weg.
export function FullscreenButton() {
  const [active, setActive] = useState(false);
  useEffect(() => {
    const sync = () => setActive(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);
  if (!document.fullscreenEnabled) return null;
  return <button className="game-fullscreen" onClick={() => { void (active ? document.exitFullscreen() : document.documentElement.requestFullscreen()); }} aria-label={active ? 'Volledig scherm sluiten' : 'Volledig scherm'} data-testid="button-fullscreen">
    {active ? <Minimize size={16} /> : <Maximize size={16} />}
  </button>;
}

export function GameTopBar({ children }: { children?: ReactNode }) {
  return <header className="game-top">
    <Link href="/" className="game-back"><ChevronLeft size={16} /> TERUG</Link>
    <div className="game-top-right">{children}<FullscreenButton /></div>
  </header>;
}

export default function GamePage() {
  const { slug } = useParams<{ slug: string }>();
  const game = GAMES.find((candidate) => candidate.slug === slug);
  if (!game?.Game) return <NotFound />;
  const { Game } = game;
  return <main className="game-screen" data-testid={`page-game-${game.slug}`}>
    <GameTopBar />
    <div className="game-body">
      <h1 className="display game-title">{game.title}<em>.</em></h1>
      <p className="game-intro">{game.intro}</p>
      <Game />
    </div>
  </main>;
}
