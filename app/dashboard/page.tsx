import Link from "next/link";

export default function Dashboard() {
  return (
    <main className="min-h-screen bg-[#080808] text-[#c8c8c8] flex items-center justify-center px-6">
      <div className="max-w-lg space-y-6">
        <h1 className="text-3xl text-white">Try your first Probe review</h1>
        <p>
          Probe reviews pull requests in repositories where its GitHub App is
          installed. You can close this page; reviews run through GitHub webhooks.
        </p>
        <ol className="list-decimal pl-5 space-y-3">
          <li>Check that Probe has access to the repository you want reviewed.</li>
          <li>Open a pull request, or push a new commit to an existing PR.</li>
          <li>Look for the bot review on the pull request in GitHub.</li>
        </ol>
        <a className="inline-block text-[#6ee7b7] underline" href="https://github.com/settings/installations">
          Manage GitHub App installations
        </a>
        <p className="text-sm">For organization repositories, check the organization’s installed GitHub Apps.</p>
        <Link className="inline-block underline" href="/">Back to Probe</Link>
      </div>
    </main>
  );
}
