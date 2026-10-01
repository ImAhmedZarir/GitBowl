export function BowlLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M2.5 10.5h19c0 5.25-4.25 9.5-9.5 9.5S2.5 15.75 2.5 10.5Z" className="fill-primary" />
      <circle cx="8" cy="6" r="2.2" className="stroke-primary" strokeWidth="1.6" fill="none" />
      <circle cx="16" cy="6" r="2.2" className="stroke-primary" strokeWidth="1.6" fill="none" />
      <path d="M8 8.2v2.3M16 8.2v2.3M10.2 6h3.6" className="stroke-primary" strokeWidth="1.6" />
    </svg>
  );
}
