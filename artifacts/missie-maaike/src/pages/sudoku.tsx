import { useEffect, useState } from 'react';
import { Delete, RotateCcw } from 'lucide-react';
import { newSudoku, peers } from '@/lib/sudoku';
import { GameTopBar } from '@/pages/game';

const clockLabel = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

export default function Sudoku() {
  // Elke keer dat de pagina opent of ververst ontstaat hier een nieuwe puzzel.
  const [game, setGame] = useState(() => newSudoku());
  const [cells, setCells] = useState(game.puzzle);
  const [selected, setSelected] = useState<number | null>(null);
  const [seconds, setSeconds] = useState(0);
  const won = cells.every((value, index) => value === game.solution[index]);

  useEffect(() => {
    if (won) return;
    const timer = window.setInterval(() => setSeconds((current) => current + 1), 1000);
    return () => window.clearInterval(timer);
  }, [won]);

  function restart() {
    const next = newSudoku();
    setGame(next);
    setCells(next.puzzle);
    setSelected(null);
    setSeconds(0);
  }

  function place(value: number) {
    if (selected === null || game.puzzle[selected] || won) return;
    setCells((current) => current.map((cell, index) => (index === selected ? value : cell)));
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (/^[1-9]$/.test(event.key)) place(Number(event.key));
      else if (event.key === 'Backspace' || event.key === 'Delete' || event.key === '0') place(0);
      else if (event.key.startsWith('Arrow')) {
        event.preventDefault();
        const step = ({ ArrowUp: -9, ArrowDown: 9, ArrowLeft: -1, ArrowRight: 1 } as Record<string, number>)[event.key] ?? 0;
        setSelected((current) => {
          const next = (current ?? 40) + step;
          return next >= 0 && next < 81 ? next : current;
        });
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const related = selected === null ? [] : peers(selected);
  return (
    <main className="sudoku-screen" data-testid="page-sudoku">
      <GameTopBar><strong className="mono sudoku-time" data-testid="text-sudoku-time">{clockLabel(seconds)}</strong></GameTopBar>
      <h1 className="display sudoku-title">{won ? <>Gekraakt<em>.</em></> : <>Sudoku<em>.</em></>}</h1>
      <div className="sudoku-board" role="grid" aria-label="Sudoku">
        {cells.map((value, index) => {
          const row = Math.floor(index / 9);
          const column = index % 9;
          const wrong = value !== 0 && peers(index).some((peer) => cells[peer] === value);
          const classes = [
            game.puzzle[index] ? 'cell-given' : '',
            selected === index ? 'cell-selected' : related.includes(index) ? 'cell-related' : '',
            selected !== null && selected !== index && value !== 0 && cells[selected] === value ? 'cell-same' : '',
            wrong ? 'cell-wrong' : '',
            column === 2 || column === 5 ? 'cell-box-right' : '',
            row === 2 || row === 5 ? 'cell-box-bottom' : '',
          ].join(' ');
          return <button key={index} className={classes} onClick={() => setSelected(index)} aria-label={`Rij ${row + 1}, kolom ${column + 1}${value ? `, ${value}` : ', leeg'}`} data-testid={`button-sudoku-cell-${index}`}>{value || ''}</button>;
        })}
      </div>
      <div className="sudoku-pad">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((value) => <button key={value} onClick={() => place(value)} data-testid={`button-sudoku-digit-${value}`}>{value}</button>)}
        <button onClick={() => place(0)} aria-label="Wissen" data-testid="button-sudoku-clear"><Delete size={18} /></button>
      </div>
      {won && <p className="sudoku-won" role="status">Opgelost in {clockLabel(seconds)}.</p>}
      <button className="sudoku-new" onClick={restart} data-testid="button-sudoku-new"><RotateCcw size={14} /> NIEUWE SUDOKU</button>
    </main>
  );
}
