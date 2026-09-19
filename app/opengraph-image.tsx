import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";

export const alt = "ancestree — a space to grow your tree.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const NAME = "ancestree";
const TAGLINE = "A SPACE TO GROW YOUR TREE.";

/**
 * Public Sans, subset to the characters drawn here. ImageResponse can't read
 * the woff2 that next/font serves, so this asks Google Fonts for TrueType
 * instead, the same way next/font reaches it: once, at build time.
 */
async function publicSans(weight: number, text: string) {
  const css = await fetch(
    `https://fonts.googleapis.com/css2?family=Public+Sans:wght@${weight}&text=${encodeURIComponent(text)}`,
    { cache: "force-cache" },
  ).then((res) => res.text());
  const url = css.match(/src: url\((.+?)\) format\('(?:truetype|opentype)'\)/)?.[1];
  if (!url) {
    throw new Error(`Google Fonts sent no TrueType file for Public Sans ${weight}`);
  }
  return fetch(url, { cache: "force-cache" }).then((res) => res.arrayBuffer());
}

const [mark, semibold, medium] = await Promise.all([
  readFile(join(process.cwd(), "public/brand/ancestree-mark-512.png"), "base64"),
  publicSans(600, NAME),
  publicSans(500, TAGLINE),
]);

/**
 * The link preview: the mark over the name and tagline, stacked down the
 * middle so a square crop (WhatsApp, some chat apps) still keeps all three.
 */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#fbf8f1",
          color: "#0a0a0a",
          fontFamily: "Public Sans",
        }}
      >
        <img src={`data:image/png;base64,${mark}`} width={300} height={300} alt="" />
        <div
          style={{
            marginTop: 12,
            fontSize: 104,
            fontWeight: 600,
            letterSpacing: -2.6,
            lineHeight: 1,
          }}
        >
          {NAME}
        </div>
        <div
          style={{
            marginTop: 22,
            fontSize: 26,
            fontWeight: 500,
            letterSpacing: 2.1,
          }}
        >
          {TAGLINE}
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Public Sans", data: semibold, weight: 600, style: "normal" },
        { name: "Public Sans", data: medium, weight: 500, style: "normal" },
      ],
    },
  );
}
