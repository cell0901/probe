"use client";

import { useState, useEffect } from "react";

// ── tiny utility ────────────────────────────────────────────────────────────
const cn = (...classes: (string | false | undefined)[]) =>
  classes.filter(Boolean).join(" ");

// ── animated terminal comment block ─────────────────────────────────────────
const REVIEW_LINES = [
  { type: "label", text: "GEMINI · PR #247 · src/auth/middleware.ts" },
  { type: "blank", text: "" },
  { type: "issue", text: "⚠  Potential token leak on line 34" },
  {
    type: "body",
    text: "    The JWT secret is read from process.env inside the",
  },
  {
    type: "body",
    text: "    request handler. Cache it at module load instead.",
  },
  { type: "blank", text: "" },
  { type: "suggest", text: "✦  Suggestion" },
  { type: "code", text: "  − const secret = process.env.JWT_SECRET" },
  { type: "code", text: "  + const secret = env.JWT_SECRET  // validated" },
  { type: "blank", text: "" },
  { type: "ok", text: "✓  Auth flow looks correct" },
  { type: "ok", text: "✓  Rate-limiting applied consistently" },
  { type: "blank", text: "" },
  { type: "label", text: "2 issues  ·  2 passed  ·  0 critical" },
];

function TerminalBlock() {
  const [visibleCount, setVisibleCount] = useState(0);
  const [cursor, setCursor] = useState(true);

  useEffect(() => {
    if (visibleCount < REVIEW_LINES.length) {
      const t = setTimeout(() => setVisibleCount((v) => v + 1), 90);
      return () => clearTimeout(t);
    }
  }, [visibleCount]);

  useEffect(() => {
    const t = setInterval(() => setCursor((c) => !c), 530);
    return () => clearInterval(t);
  }, []);

  const color = (type: string) => {
    if (type === "label") return "text-[#888]";
    if (type === "issue") return "text-[#f0c060]";
    if (type === "suggest") return "text-[#7ec8e3]";
    if (type === "code") return "text-[#aaa]";
    if (type === "ok") return "text-[#6ee7b7]";
    return "text-[#555]";
  };

  return (
    <div className="relative border border-[#222] bg-[#0c0c0c] rounded-md font-['IBM_Plex_Mono',monospace] text-[13px] leading-[1.7] p-5 overflow-hidden shadow-2xl">
      {/* corner label */}
      <span className="absolute top-3 right-4 text-[10px] text-[#333] tracking-widest uppercase">
        review output
      </span>

      {REVIEW_LINES.slice(0, visibleCount).map((line, i) => (
        <div key={i} className={cn("whitespace-pre", color(line.type))}>
          {line.text || "\u00a0"}
        </div>
      ))}

      {visibleCount < REVIEW_LINES.length && (
        <span className="inline-block w-[7px] h-[14px] bg-[#6ee7b7] align-middle ml-0.5" />
      )}

      {visibleCount >= REVIEW_LINES.length && (
        <span
          className={cn(
            "inline-block w-[7px] h-[14px] bg-[#555] align-middle ml-0.5 transition-opacity duration-100",
            cursor ? "opacity-100" : "opacity-0"
          )}
        />
      )}
    </div>
  );
}

// ── scrolling ticker ─────────────────────────────────────────────────────────
const TICKER_ITEMS = [
  "INSTANT PR FEEDBACK",
  "ZERO CONFIG",
  "GITHUB NATIVE",
  "OPEN EVERY PR SMARTER",
  "AI CODE REVIEW",
];

function Ticker() {
  const items = [...TICKER_ITEMS, ...TICKER_ITEMS];
  return (
    <div className="overflow-hidden border-y border-[#1a1a1a] py-2.5 select-none bg-[#080808]">
      <div className="flex gap-12 animate-ticker whitespace-nowrap">
        {items.map((item, i) => (
          <span
            key={i}
            className="text-[11px] tracking-[0.25em] text-white/50 uppercase font-['IBM_Plex_Mono',monospace] flex-shrink-0"
          >
            {i % 2 === 0 ? "·" : "✦"}&nbsp;&nbsp;{item}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── feature card ─────────────────────────────────────────────────────────────
function FeatureCard({
  index,
  title,
  body,
  ascii,
}: {
  index: string;
  title: string;
  body: string;
  ascii: string;
}) {
  return (
    <div className="border border-[#222] rounded-md p-8 bg-[#0e0e0e] hover:bg-[#111] hover:border-[#333] transition-all duration-300 group h-full flex flex-col">
      <div className="font-['IBM_Plex_Mono',monospace] text-[10px] text-[#6E6B6B] mb-5 tracking-widest">
        {index}
      </div>
      <pre className="font-['IBM_Plex_Mono',monospace] text-[12px] text-[#6E6B6B] leading-tight mb-6 group-hover:text-[#6a6a6a] transition-colors duration-500">
        {ascii}
      </pre>
      <div className="text-[15px] text-[#d8d8d8] mb-2.5 tracking-tight font-medium">
        {title}
      </div>
      <div className="text-[13px] text-[#888] leading-relaxed flex-grow">
        {body}
      </div>
    </div>
  );
}

// ── step row ─────────────────────────────────────────────────────────────────
function Step({
  n,
  title,
  body,
}: {
  n: string;
  title: string;
  body: string;
}) {
  return (
    <div className="flex flex-col sm:flex-row gap-4 sm:gap-8 items-start border-b border-[#1e1e1e] py-8 last:border-b-0">
      <div className="font-['IBM_Plex_Mono',monospace] text-[12px] text-[#6ee7b7] w-6 flex-shrink-0 pt-0.5">
        {n}
      </div>
      <div>
        <div className="text-[16px] text-[#e0e0e0] mb-2 font-medium">{title}</div>
        <div className="text-[14px] text-[#777] leading-relaxed">{body}</div>
      </div>
    </div>
  );
}

// ── main page ────────────────────────────────────────────────────────────────
export default function Home() {
  return (
    <>
      {/* Retained minimal CSS for animations, noise, and fonts that Tailwind doesn't do out of the box */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@300;400;500;600&display=swap');

        html { scroll-behavior: smooth; }
        ::selection { background: #6ee7b720; }

        @keyframes ticker {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-ticker { animation: ticker 22s linear infinite; }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .fade-up        { animation: fadeUp 0.7s ease both; }
        .fade-up-d1     { animation: fadeUp 0.7s 0.12s ease both; }
        .fade-up-d2     { animation: fadeUp 0.7s 0.24s ease both; }
        .fade-up-d3     { animation: fadeUp 0.7s 0.36s ease both; }

        @keyframes pulse-dot {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0.3; }
        }
        .animate-pulse-dot { animation: pulse-dot 2s infinite; }

        /* noise grain overlay */
        html::before {
          content: '';
          position: fixed;
          inset: 0;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E");
          opacity: 0.025;
          pointer-events: none;
          z-index: 9999;
        }
      `}</style>

      {/* Main Container */}
      <div className="min-h-screen bg-[#080808] text-[#c8c8c8] font-['IBM_Plex_Sans',sans-serif]">

        {/* ── NAV ──────────────────────────────────────────────────────── */}
        <nav className="sticky top-0 z-50 border-b border-[#111] bg-[#080808]/90 backdrop-blur-md">
          <div className="max-w-[1100px] mx-auto px-6 h-[52px] flex items-center justify-between">
            {/* logo */}
            <a href="#" className="font-['IBM_Plex_Mono',monospace] text-[13px] text-[#ccc] tracking-[0.02em] flex items-center gap-2">
              <span className="text-[#6ee7b7] text-[16px]">✦</span>
              probe
            </a>

            {/* desktop links */}
            <div className="hidden md:flex items-center gap-8 font-['IBM_Plex_Mono',monospace] text-[11px] text-white/60 tracking-[0.12em] uppercase">
              <a href="#how" className="hover:text-white/80 transition-colors duration-200">
                How it works
              </a>
              <a href="#features" className="hover:text-white/80 transition-colors duration-200">
                Features
              </a>
              <a
                href="/login"
                className="inline-flex items-center gap-2 px-[14px] py-[7px] bg-[#6ee7b7] hover:bg-[#a7f3d0] text-[#080808] font-medium tracking-[0.05em] uppercase transition-all duration-200 rounded-sm"
              >
                Login with GitHub
              </a>
            </div>
          </div>
        </nav>

        {/* ── TICKER ───────────────────────────────────────────────────── */}
        <Ticker />

        {/* ── HERO ─────────────────────────────────────────────────────── */}
        <section className="max-w-[1100px] mx-auto px-6 pt-[100px] pb-20">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-16 items-center">
            {/* left */}
            <div>
              <div className="fade-up font-['IBM_Plex_Mono',monospace] text-[10px] text-white/30 tracking-[0.25em] uppercase mb-6 flex items-center gap-2">
                <span className="inline-block w-1.5 h-1.5 bg-[#6ee7b7] rounded-full animate-pulse-dot" />
                AI-powered code review ·
              </div>

              <h1 className="fade-up-d1 font-light text-[clamp(36px,5vw,58px)] leading-[1.08] text-[#e8e8e8] mb-7 tracking-[-0.03em]">
                Every PR,
                <br />
                reviewed by{" "}
                <span className="text-[#6ee7b7] font-normal">
                  Probe
                </span>
              </h1>

              <p className="fade-up-d2 text-[15px] text-[#6B6A6A] leading-[1.75] mb-10 max-w-[420px]">
                Connect your GitHub repo in seconds. Our bot listens for pull
                requests and posts an AI review — issues found, suggestions made,
                good code called out.
              </p>

              <div className="fade-up-d3 flex flex-wrap gap-3">
                <a
                  href="/login"
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#6ee7b7] hover:bg-[#a7f3d0] text-[#080808] font-['IBM_Plex_Mono',monospace] text-[12px] font-medium tracking-[0.05em] uppercase transition-colors rounded-sm"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
                  </svg>
                  Login with GitHub
                </a>
                <a
                  href="#how"
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-transparent text-[#5C5C5C] border border-[#222] hover:border-[#333] hover:text-[#888] font-['IBM_Plex_Mono',monospace] text-[12px] tracking-[0.05em] uppercase transition-colors rounded-sm"
                >
                  See how it works →
                </a>
              </div>

              {/* trust bar */}
              <div className="mt-12 pt-7 border-t border-[#111] flex flex-wrap gap-8">
                {[
                  ["0", "config files"],
                ].map(([n, l]) => (
                  <div key={l}>
                    <div className="font-['IBM_Plex_Mono',monospace] text-[20px] text-[#bbb] font-medium">
                      {n}
                    </div>
                    <div className="font-['IBM_Plex_Mono',monospace] text-[10px] text-white/40 tracking-[0.15em] uppercase mt-0.5">
                      {l}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* right — terminal */}
            <div className="fade-up-d2">
              <TerminalBlock />
            </div>
          </div>
        </section>

        {/* ── HOW IT WORKS ─────────────────────────────────────────────── */}
        <section id="how" className="border-t border-[#111] py-20 px-6">
          <div className="max-w-[1100px] mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-10 md:gap-16">
              <div>
                <div className="font-['IBM_Plex_Mono',monospace] text-[10px] text-[#787777] tracking-[0.25em] uppercase md:sticky md:top-20">
                  How it works
                </div>
              </div>

              <div>
                <Step
                  n="01"
                  title="Login with GitHub"
                  body="OAuth flow — one click. Request only the permissions bot actually need: read your repos, post comments on PRs."
                />
                <Step
                  n="02"
                  title="Select a repository"
                  body="Pick which repos you want reviewed."
                />
                <Step
                  n="03"
                  title="Open a pull request"
                  body="The moment a PR is opened or updated, bot wakes up, reads the diff, and sends it to LLM."
                />
                <Step
                  n="04"
                  title="Receive the review"
                  body="A structured comment appears under your PR: potential bugs, suggestions, style notes, and a summary."
                />
              </div>
            </div>
          </div>
        </section>

        {/* ── FEATURES ─────────────────────────────────────────────────── */}
        <section id="features" className="border-t border-[#111] py-20 px-6">
          <div className="max-w-[1100px] mx-auto">
            <div className="font-['IBM_Plex_Mono',monospace] text-[10px] text-[#666] tracking-[0.25em] uppercase mb-12">
              Features
            </div>

            {/* Exactly 3 items, properly spaced with Tailwind grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <FeatureCard
                index="F-01"
                title="Diff-aware context"
                body="Only the changed lines are analyzed. No hallucinations from unrelated code."
                ascii={`  ─ old line\n  + new line\n  ↳ flagged`}
              />
              <FeatureCard
                index="F-02"
                title="GitHub-native comments"
                body="Reviews post directly as PR comments. No third-party dashboards, no new tabs."
                ascii={`  ┌─ PR #247 ──┐\n  │ ✦ 2 issues │\n  └────────────┘`}
              />
              <FeatureCard
                index="F-03"
                title="Zero-config"
                body="Connect and go. No YAML files. No environments."
                ascii={` .probe\n  ────────\n  (no file)`}
              />
            </div>
          </div>
        </section>

        {/* ── CTA ──────────────────────────────────────────────────────── */}
        <section className="border-t border-[#111] py-24 px-6 text-center">
          <div className="max-w-[560px] mx-auto">
            <div className="font-['IBM_Plex_Mono',monospace] text-[10px] text-[#666] tracking-[0.25em] uppercase mb-6">
              Ready to start?
            </div>
            <h2 className="font-light text-[clamp(28px,4vw,44px)] leading-[1.1] text-[#e8e8e8] tracking-[-0.03em] mb-5">
              Your next PR will be
              <br />
              Reviewed in no time.
            </h2>
            <p className="text-[14px] text-[#5E5D5D] leading-[1.7] mb-9">
              Connect GitHub in 30 seconds.
            </p>
            <a
              href="/login"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-[#6ee7b7] hover:bg-[#a7f3d0] text-[#080808] font-['IBM_Plex_Mono',monospace] text-[13px] font-medium tracking-[0.05em] uppercase transition-colors rounded-sm"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
              </svg>
              Get started — it's free
            </a>
          </div>
        </section>

        {/* ── FOOTER ───────────────────────────────────────────────────── */}
        <footer className="border-t border-[#111] py-7 px-6">
          <div className="max-w-[1100px] mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
            <span className="font-['IBM_Plex_Mono',monospace] text-[11px] text-[#2a2a2a]">
              ✦ reviewbot · {new Date().getFullYear()}
            </span>
            <span className="font-['IBM_Plex_Mono',monospace] text-[10px] text-[#222] tracking-[0.15em] uppercase">
              built with gemini + next.js
            </span>
          </div>
        </footer>
      </div>
    </>
  );
}
