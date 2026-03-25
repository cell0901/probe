"use client";

export default function LoginPage() {
  const handleInstall = () => {
    // This combines installation + user OAuth
    const params = new URLSearchParams({
      client_id: process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID!,
      state: 'random-state-string' // CSRF protection
    });

    window.location.href =
      `https://github.com/apps/probe-01/installations/new?${params}`;
  };
  return (
    <div className="min-h-screen flex items-center justify-center relative bg-white font-['IBM_Plex_Sans',sans-serif]">
      {/* ── Subtle Graph Paper Grid ───────────────────────────────────────── */}
      <style>{`
        .bg-grid {
          background-size: 40px 40px;
          background-image:
            linear-gradient(to right, rgba(0, 0, 0, 0.03) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(0, 0, 0, 0.03) 1px, transparent 1px);
          background-position: center center;
        }
      `}</style>
      <div className="absolute inset-0 bg-grid pointer-events-none" />

      {/* ── Login Card ────────────────────────────────────────────────────── */}
      <div className="relative z-10 w-full max-w-[360px] bg-white border border-[#eaeaea] p-10 pb-12 flex flex-col items-center shadow-[0_4px_24px_rgba(0,0,0,0.02)]">

        <h1 className="text-[22px] font-bold text-[#111] mb-8 tracking-tight">
          SIGN IN
        </h1>

        <button
          onClick={handleInstall}
          className="w-full flex items-center justify-center gap-3 border border-[#e2e2e2] bg-[#fbfbfb] hover:bg-[#f4f4f4] hover:border-[#d5d5d5] transition-all duration-200 py-3.5 px-4"
        >
          {/* GitHub SVG Icon */}
          <svg height="16" width="16" viewBox="0 0 16 16" fill="currentColor" className="text-[#24292e]">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"></path>
          </svg>
          <span className="font-['IBM_Plex_Mono',monospace] text-[11px] text-[#333] tracking-[0.05em] uppercase mt-0.5">
            Continue with GitHub
          </span>
        </button>
      </div>

    </div>
  );
}
