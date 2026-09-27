// Short video instructions for owners, shown in «Помощь». 30–60 seconds
// each works best: one task per video. Links to YouTube, VK Video, Rutube,
// a Telegram channel post — anything that opens on a phone. Empty — no section.

export interface HelpVideo {
  title: string;
  url: string;
}

export const HELP_VIDEOS: HelpVideo[] = [
  // { title: "Как добавить товар за минуту", url: "https://…" },
  // { title: "Как поделиться витриной и повесить QR-плакат", url: "https://…" }
];
