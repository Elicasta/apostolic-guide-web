type BrandCrownProps = {
  className?: string;
  title?: string;
};

export function BrandCrown({ className = "", title }: BrandCrownProps) {
  return (
    <svg
      className={`ag-crown-mark ${className}`.trim()}
      viewBox="0 0 132 92"
      fill="none"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <path
        d="M14 61 25 24l29 29L68 15l25 37 22-28 3 39c-32 8-70 8-104-2Z"
        stroke="currentColor"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M20 72c29 6 61 6 94 0"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <path
        className="ag-crown-underline"
        d="M31 84c24-4 47-3 71 0"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
      />
    </svg>
  );
}
