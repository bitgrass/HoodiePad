import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "HoodiePad — Launch on Robinhood Chain",
    template: "%s · HoodiePad",
  },
  description:
    "Launch fixed-supply token markets paired with HOODIE. No presale, no migration, and creators keep 80% of canonical-pool fees.",
  openGraph: {
    title: "HoodiePad — The hood stays on",
    description:
      "Fixed-supply token markets paired with HOODIE on Robinhood Chain.",
    type: "website",
    images: [
      {
        url: "/og.png",
        width: 1536,
        height: 1024,
        alt: "HoodiePad — The hood stays on",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
