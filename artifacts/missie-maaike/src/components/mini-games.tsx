import { useEffect, useRef, useState, type ComponentType, type FormEvent } from 'react';
import { Binary, Brain, Grid3x3, KeyRound, Palette, Radio, RotateCcw, Timer, TrendingUp } from 'lucide-react';

const randomInt = (max: number) => Math.floor(Math.random() * max);
const memorySymbols = ['△', '○', '◇', '□', '⌘', '＋'];
const cipherWords = ['AGENT', 'RADAR', 'SPION', 'KOMPAS', 'DOSSIER', 'SIGNAAL', 'GEHEIM', 'KLUIS', 'SLEUTEL', 'SCHADUW'];
const inkColors = [{ name: 'ROOD', color: '#ff8d7d' }, { name: 'GROEN', color: '#65dcba' }, { name: 'BLAUW', color: '#83c5f5' }, { name: 'GEEL', color: '#ffdf85' }];

function shuffledMemoryDeck() {
  return [...memorySymbols, ...memorySymbols]
    .map((symbol, index) => ({ symbol, key: `${symbol}-${index}` }))
    .sort(() => Math.random() - 0.5);
}

function MemoryGame() {
  const [deck, setDeck] = useState(shuffledMemoryDeck);
  const [flipped, setFlipped] = useState<number[]>([]);
  const [matched, setMatched] = useState<number[]>([]);
  const [turns, setTurns] = useState(0);

  useEffect(() => {
    if (flipped.length !== 2) return;
    const [first, second] = flipped;
    const same = deck[first]?.symbol === deck[second]?.symbol;
    const timeout = window.setTimeout(() => {
      if (same) setMatched((current) => [...current, first, second]);
      setFlipped([]);
    }, same ? 440 : 850);
    return () => window.clearTimeout(timeout);
  }, [deck, flipped]);

  function flipCard(index: number) {
    if (flipped.length === 2 || flipped.includes(index) || matched.includes(index)) return;
    setFlipped((current) => [...current, index]);
    if (flipped.length === 1) setTurns((current) => current + 1);
  }
  function reset() {
    setDeck(shuffledMemoryDeck());
    setFlipped([]);
    setMatched([]);
    setTurns(0);
  }

  return <>
    <div className="memory-board">
      {deck.map((card, index) => {
        const shown = flipped.includes(index) || matched.includes(index);
        return <button className={`memory-tile ${shown ? 'tile-revealed' : ''} ${matched.includes(index) ? 'tile-matched' : ''}`} key={card.key} onClick={() => flipCard(index)} aria-label={shown ? `Symbool ${card.symbol}` : `Kaart ${index + 1}, verborgen`} data-testid={`button-memory-card-${index}`} disabled={matched.includes(index) || flipped.length === 2}>
          {shown ? card.symbol : <span>{String(index + 1).padStart(2, '0')}</span>}
        </button>;
      })}
    </div>
    <div className="game-status"><span>{matched.length === deck.length ? 'ALLE PAREN GEVONDEN' : `${matched.length / 2} / 6 PAREN · ${turns} BEURTEN`}</span><button onClick={reset} aria-label="Opnieuw beginnen" data-testid="button-reset-memory"><RotateCcw size={15} /></button></div>
  </>;
}

function ReactionGame() {
  const [phase, setPhase] = useState<'idle' | 'waiting' | 'ready' | 'early' | 'result'>('idle');
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [best, setBest] = useState<number | null>(null);
  const timer = useRef<number | null>(null);
  const startedAt = useRef(0);

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);

  function tap() {
    if (phase === 'waiting') {
      if (timer.current !== null) window.clearTimeout(timer.current);
      setPhase('early');
    } else if (phase === 'ready') {
      const ms = Math.max(1, Date.now() - startedAt.current);
      setElapsed(ms);
      setBest((current) => (current === null ? ms : Math.min(current, ms)));
      setPhase('result');
    } else {
      setElapsed(null);
      setPhase('waiting');
      timer.current = window.setTimeout(() => {
        startedAt.current = Date.now();
        setPhase('ready');
      }, 1300 + randomInt(2200));
    }
  }
  const copy = phase === 'waiting' ? 'WACHT OP HET SIGNAAL…' : phase === 'ready' ? 'NU — TIK!' : phase === 'early' ? 'TE VROEG' : phase === 'result' && elapsed !== null ? `${elapsed} MS` : 'TIK OM TE STARTEN';

  return <>
    <button className={`reaction-target reaction-${phase}`} onClick={tap} data-testid="button-reaction-target">
      <span className="reaction-orbit" /><strong>{copy}</strong><small>{phase === 'early' || phase === 'result' ? 'TIK OM OPNIEUW TE PROBEREN' : phase === 'waiting' ? 'BLIJF GEFIXEERD' : 'REACTIEVERMOGEN'}</small>
    </button>
    <div className="game-status"><span>{best ? `BESTE TIJD · ${best} MS` : 'BESTE TIJD · —'}</span></div>
  </>;
}

function CodeMemoryGame() {
  const [code, setCode] = useState('');
  const [input, setInput] = useState('');
  const [phase, setPhase] = useState<'idle' | 'showing' | 'input' | 'result'>('idle');

  useEffect(() => {
    if (phase !== 'showing') return;
    const timeout = window.setTimeout(() => setPhase('input'), 2600);
    return () => window.clearTimeout(timeout);
  }, [phase, code]);

  function start() {
    setCode(String(1000 + randomInt(9000)));
    setInput('');
    setPhase('showing');
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPhase('result');
  }

  return <>
    <div className="code-display" aria-live="polite">
      {phase === 'showing' ? code.split('').map((digit, index) => <span key={index}>{digit}</span>) : <span className="code-placeholder">{phase === 'idle' ? '— — — —' : '? ? ? ?'}</span>}
    </div>
    {phase === 'input' && <form className="code-entry" onSubmit={submit}>
      <input aria-label="Voer de vier cijfers in" data-testid="input-four-digit-code" inputMode="numeric" maxLength={4} value={input} onChange={(event) => setInput(event.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="4 cijfers" autoFocus />
      <button type="submit" disabled={input.length !== 4} data-testid="button-submit-four-digit">CONTROLEER</button>
    </form>}
    {phase === 'result' && <p className={`game-result ${input === code ? 'good' : ''}`} role="status">{input === code ? 'Code bevestigd. Geheugen intact.' : `Niet bevestigd. De code was ${code}.`}</p>}
    {(phase === 'idle' || phase === 'result') && <button className="game-action" onClick={start} data-testid="button-start-four-digit">{phase === 'idle' ? 'START' : 'OPNIEUW'}</button>}
    {phase === 'showing' && <div className="game-status"><span>ONTHOUD DE CODE</span></div>}
  </>;
}

const newSecret = () => String(randomInt(10000)).padStart(4, '0');
function scoreGuess(secret: string, guess: string) {
  const left = [...secret];
  const right = [...guess];
  let exact = 0;
  let near = 0;
  left.forEach((digit, index) => { if (digit === right[index]) { exact += 1; left[index] = 'x'; right[index] = 'y'; } });
  right.forEach((digit) => { const found = left.indexOf(digit); if (found >= 0) { near += 1; left[found] = 'x'; } });
  return { exact, near };
}

function CodeCrackerGame() {
  const [secret, setSecret] = useState(newSecret);
  const [guess, setGuess] = useState('');
  const [guesses, setGuesses] = useState<string[]>([]);
  const [cracked, setCracked] = useState(false);
  const over = cracked || guesses.length >= 8;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (over) {
      setSecret(newSecret());
      setGuesses([]);
      setCracked(false);
      setGuess('');
      return;
    }
    if (guess.length !== 4) return;
    const { exact, near } = scoreGuess(secret, guess);
    setGuesses((current) => [`${guess} · ${exact} goed · ${near} verkeerde plek`, ...current]);
    if (exact === 4) setCracked(true);
    setGuess('');
  }

  return <>
    <form className="code-entry" onSubmit={submit}>
      {!over && <input aria-label="Jouw poging" inputMode="numeric" maxLength={4} value={guess} onChange={(event) => setGuess(event.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="4 cijfers" data-testid="input-code-cracker" autoFocus />}
      <button type="submit" disabled={!over && guess.length !== 4} data-testid="button-code-cracker">{over ? 'NIEUWE CODE' : 'PROBEER'}</button>
    </form>
    <div className="game-status"><span>{cracked ? 'GEKRAAKT' : over ? `DE CODE WAS ${secret}` : `${8 - guesses.length} POGINGEN OVER`}</span></div>
    <div className="game-log mono">{guesses.map((line, index) => <div key={`${line}-${index}`}>{line}</div>)}</div>
  </>;
}

function newCipher() {
  const word = cipherWords[randomInt(cipherWords.length)];
  const shift = 1 + randomInt(5);
  return { word, shift, text: word.replace(/[A-Z]/g, (letter) => String.fromCharCode(((letter.charCodeAt(0) - 65 + shift) % 26) + 65)) };
}

function CipherGame() {
  const [cipher, setCipher] = useState(newCipher);
  const [answer, setAnswer] = useState('');
  return <>
    <p className="game-note">Iedere letter staat {cipher.shift} {cipher.shift === 1 ? 'plaats' : 'plaatsen'} verder in het alfabet.</p>
    <div className="game-display mono">{cipher.text}</div>
    <div className="code-entry"><input aria-label="Ontsleuteld woord" value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="Het woord" data-testid="input-cipher" autoComplete="off" /></div>
    <div className="game-status"><span>{answer.trim().toUpperCase() === cipher.word ? 'ONTSLEUTELD' : 'NOG NIET GEKRAAKT'}</span><button onClick={() => { setCipher(newCipher()); setAnswer(''); }} aria-label="Nieuw bericht" data-testid="button-new-cipher"><RotateCcw size={15} /></button></div>
  </>;
}

function newSequence() {
  const start = 1 + randomInt(9);
  const step = 2 + randomInt(7);
  const build = [
    (i: number) => start + step * i,
    (i: number) => start * 2 ** i,
    (i: number) => start + step * i + (i * (i - 1)) / 2,
    (i: number) => start + Math.ceil(i / 2) * step + Math.floor(i / 2) * step * 2,
  ][randomInt(4)];
  const values = [0, 1, 2, 3, 4, 5].map(build);
  return { shown: values.slice(0, 5), answer: values[5] };
}

function SequenceGame() {
  const [sequence, setSequence] = useState(newSequence);
  const [answer, setAnswer] = useState('');
  return <>
    <div className="game-display mono game-display-small">{sequence.shown.join(' · ')}</div>
    <div className="code-entry"><input aria-label="Volgend getal" inputMode="numeric" value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="Volgend getal" data-testid="input-sequence" autoComplete="off" /></div>
    <div className="game-status"><span>{answer.trim() === String(sequence.answer) ? 'GOED GEZIEN' : 'NOG NIET GEVONDEN'}</span><button onClick={() => { setSequence(newSequence()); setAnswer(''); }} aria-label="Nieuwe reeks" data-testid="button-new-sequence"><RotateCcw size={15} /></button></div>
  </>;
}

function newTrap() {
  const word = inkColors[randomInt(4)];
  const others = inkColors.filter((option) => option !== word);
  return { word: word.name, ink: others[randomInt(3)] };
}

function ColorTrapGame() {
  const [trap, setTrap] = useState(newTrap);
  const [streak, setStreak] = useState(0);
  const [message, setMessage] = useState('');
  function pick(name: string) {
    if (name === trap.ink.name) {
      setStreak((current) => current + 1);
      setMessage('');
    } else {
      setMessage(`ERIN GETRAPT · REEKS WAS ${streak}`);
      setStreak(0);
    }
    setTrap(newTrap());
  }
  return <>
    <div className="game-display mono" style={{ color: trap.ink.color }} data-testid="text-color-trap">{trap.word}</div>
    <div className="trap-choices">{inkColors.map((option) => <button key={option.name} onClick={() => pick(option.name)} data-testid={`button-trap-${option.name.toLowerCase()}`}>{option.name}</button>)}</div>
    <div className="game-status"><span>{message || `REEKS · ${streak}`}</span></div>
  </>;
}

export const GAMES: { slug: string; title: string; intro: string; icon: ComponentType<{ size?: number }>; href: string; Game?: ComponentType }[] = [
  { slug: 'sudoku', title: 'Sudoku', intro: 'Elke keer een nieuwe puzzel, op tijd.', icon: Grid3x3, href: '/sudoku' },
  { slug: 'geheugenparen', title: 'Geheugenparen', intro: 'Vind de zes bij elkaar horende symbolen.', icon: Brain, href: '/oefen/geheugenparen', Game: MemoryGame },
  { slug: 'reactietest', title: 'Reactietest', intro: 'Tik pas zodra het signaal omslaat.', icon: Timer, href: '/oefen/reactietest', Game: ReactionGame },
  { slug: 'vier-cijfers', title: 'Vier cijfers', intro: 'Onthoud de code voordat hij verdwijnt.', icon: KeyRound, href: '/oefen/vier-cijfers', Game: CodeMemoryGame },
  { slug: 'codekraker', title: 'Codekraker', intro: 'Kraak vier cijfers in maximaal acht pogingen.', icon: Binary, href: '/oefen/codekraker', Game: CodeCrackerGame },
  { slug: 'onderschept-bericht', title: 'Onderschept bericht', intro: 'Schuif de letters terug en lees wat er staat.', icon: Radio, href: '/oefen/onderschept-bericht', Game: CipherGame },
  { slug: 'patroonherkenning', title: 'Patroonherkenning', intro: 'Welk getal volgt in deze reeks?', icon: TrendingUp, href: '/oefen/patroonherkenning', Game: SequenceGame },
  { slug: 'kleurval', title: 'Kleurval', intro: 'Negeer het woord. Kies de kleur waarin het staat.', icon: Palette, href: '/oefen/kleurval', Game: ColorTrapGame },
];
