import Link from "next/link";

export function Brand() {
  return (
    <Link className="brand" href="/" aria-label="HoodiePad home">
      <span className="brand-mark" aria-hidden="true">
        <span className="brand-face">•‿•</span>
      </span>
      <span>HOODIEPAD</span>
    </Link>
  );
}

