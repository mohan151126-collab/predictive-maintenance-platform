export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="32" height="32" fill="#0f1216" />
      <rect x="2" y="2" width="28" height="28" fill="none" stroke="#3d6f96" strokeWidth="2" />
      <polyline
        points="5,17 11,17 14,8 18,24 21,17 27,17"
        fill="none"
        stroke="#7db3da"
        strokeWidth="2.5"
        strokeLinecap="square"
      />
    </svg>
  );
}
