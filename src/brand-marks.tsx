type BrandCrownProps = {
  className?: string;
  title?: string;
};

export function BrandCrown({ className = "", title }: BrandCrownProps) {
  return (
    <svg
      className={`ag-crown-mark ${className}`.trim()}
      viewBox="0 0 120 82"
      fill="none"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <path
        d="M16 57 27 25 48 47 60 16 72 47 93 25 104 57"
        stroke="currentColor"
        strokeWidth="5.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M20 62c24 5 56 5 80 0"
        stroke="currentColor"
        strokeWidth="5.5"
        strokeLinecap="round"
      />
      <path
        className="ag-crown-underline"
        d="M35 75c17-3 33-3 50 0"
        stroke="currentColor"
        strokeWidth="4.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
