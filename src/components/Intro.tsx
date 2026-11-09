import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { ArrowRightIcon, Logo } from './icons';
import { cn } from '../lib/format';

interface Props {
  onEnter: () => void;
  version?: string;
}

export function Intro({ onEnter, version }: Props) {
  const [leaving, setLeaving] = useState(false);
  const sceneRef = useRef<HTMLDivElement>(null);
  const ctaRef = useRef<HTMLButtonElement>(null);
  const frameRef = useRef<number | null>(null);
  const finishRef = useRef<number | null>(null);
  const leavingRef = useRef(false);

  useEffect(() => {
    const timer = window.setTimeout(() => ctaRef.current?.focus(), 450);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        begin();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // begin is stable for the lifetime of the overlay
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(
    () => () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      if (finishRef.current) window.clearTimeout(finishRef.current);
    },
    [],
  );

  const begin = () => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    setLeaving(true);
    const delay = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : 640;
    finishRef.current = window.setTimeout(onEnter, delay);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    if (frameRef.current) return;
    const x = event.clientX;
    const y = event.clientY;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      const scene = sceneRef.current;
      if (!scene) return;
      const nx = (x / window.innerWidth - 0.5) * 2;
      const ny = (y / window.innerHeight - 0.5) * 2;
      scene.style.setProperty('--tilt-x', `${(-ny * 5).toFixed(2)}deg`);
      scene.style.setProperty('--tilt-y', `${(nx * 7).toFixed(2)}deg`);
    });
  };

  return (
    <div
      className={cn('intro', leaving && 'is-leaving')}
      role="dialog"
      aria-modal="true"
      aria-labelledby="intro-title"
      onPointerMove={onPointerMove}
    >
      <div className="intro-backdrop" aria-hidden="true">
        <span className="intro-grain" />
      </div>

      <div className="intro-content">
        <div className="intro-brand">
          <Logo size={28} />
          <span>BTR-Ollama</span>
        </div>

        <p className="intro-kicker">Your local workspace</p>
        <h1 className="intro-title" id="intro-title">
          A quieter place
          <br />
          to think <em>locally.</em>
        </h1>
        <p className="intro-lede">
          Talk to the models on your machine — or hand a project folder to a coding agent. Context and
          token spend stay in view, and everything stays on this computer.
        </p>

        <div className="intro-actions">
          <button ref={ctaRef} type="button" className="intro-cta" onClick={begin}>
            <span>Enter workspace</span>
            <ArrowRightIcon size={16} />
          </button>
          <span className="intro-esc">
            or press <kbd>Esc</kbd> to begin
          </span>
        </div>

        <div className="intro-meta">
          <span>v1.0</span>
          {version && (
            <>
              <span className="intro-sep" />
              <span>Ollama {version}</span>
            </>
          )}
        </div>
      </div>

      <div className="intro-scene-wrap" aria-hidden="true">
        <div className="intro-scene" ref={sceneRef}>
          <span className="scene-rule" />
          <div className="scene-halo" />
          <div className="scene-ring ring-one">
            <span className="satellite" />
          </div>
          <div className="scene-ring ring-two">
            <span className="satellite satellite-b" />
          </div>
          <div className="orb">
            <span className="orb-grid" />
            <span className="orb-sheen" />
          </div>
          <span className="scene-caption">local model — 01</span>
        </div>
      </div>
    </div>
  );
}
