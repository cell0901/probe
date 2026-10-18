# Probe 
Probe is PR review tool for github repositories


### How it works

1. User Signin with GitHub.
2. While Signin, Grant permission of repositories to want give access to
3. Now on every Pr in your repository bot will add review based on code changes
   from api 


## Setting up locally

1. Clone the repository
2. Run `npm install`
3. Copy ```cp .env.example .env``` 
4. Create a Github app in your github account and grant permissions like read and write
5. Create a Github app private key 
4. Copy and paste your github app private key and github app id to `.env`
5. Paste you github client secret for interacting with Github api 
6. Create gemini api key form google Ai studio and paste in `.env`

### Webhook configuration

Set the GitHub App webhook URL to `https://YOUR_HOST/api/webhook` and subscribe
to **Pull request** events. Generate a random webhook secret (for example,
`openssl rand -hex 32`) and put the same value in the GitHub App's webhook
**Secret** field and `GITHUB_WEBHOOK_SECRET` in `.env`. Restart the server after
changing environment variables. The endpoint rejects requests if the secret is
missing or the signature is invalid.

Only `opened` and `synchronize` pull request events start reviews. Other events,
including GitHub's `ping`, are acknowledged without starting a review. Malformed
payloads return `400`; review failures that reach the webhook return `500`.
Review processing is still synchronous; failed deliveries can be redelivered
from the GitHub App's **Advanced → Recent deliveries** page.

Run `npm test` with Node.js 22.18+ to check webhook authentication, event filtering,
payload validation, and failure responses without calling GitHub or Gemini.

### GitHub installation and authorization

In your GitHub App settings, enable **Request user authorization (OAuth) during
installation** and set the **first Callback URL** to
`https://YOUR_HOST/api/callback` (or `http://localhost:3000/api/callback` for local
development). Use the same host when opening Probe so the temporary setup cookie
can be returned to the callback. Set `NEXT_PUBLIC_GITHUB_CLIENT_ID` and
`GITHUB_CLIENT_SECRET` in `.env`. The installation link currently targets the
`probe-01` GitHub App in `app/api/install/route.ts`; change that slug if using
your own app.

Start from `/login`. The server creates a random state in a ten-minute HttpOnly,
SameSite=Lax cookie, then redirects to GitHub to install and authorize the app.
The callback checks that state before exchanging the code, verifies the GitHub
user response, clears the temporary cookie, and redirects to `/dashboard` for
instructions. Failed or expired attempts return to `/login` with a fixed error
message and a retry link. Production should be served over HTTPS so the cookie
is marked Secure.

User OAuth tokens are used only inside the callback and are never logged,
stored, or returned to the browser. Reviews continue to use installation tokens.
The dashboard is a public setup guide, not a private account area; this flow
does not create a persistent login session. GitHub App installations started
directly on GitHub do not have Probe's state cookie and must restart from
`/login` to complete this callback.

### File fetching and review limits

Probe lists changed files with pagination (up to GitHub's 3,000-file API limit).
Full-file content is fetched with the installation token from the PR's source
repository, including fork repositories when accessible, at the webhook's commit
SHA. The GitHub App needs **Contents: Read-only** and **Pull requests: Read and
write** permissions. Start a new PR update if the head commit changed while the
file list was being fetched.

Each review includes at most 30 text diffs, with a 20 KB limit per diff and a
200 KB combined budget for diffs and full-file content. Diff space is reserved
first; remaining space can provide up to 50 KB of UTF-8 context per file.
Downloads stop at their byte limit. These limits are defined at the top of
`lib/fetchFiles.ts`.

Deleted files are reviewed from their diffs. Files without text diffs (including
binary files) and oversized diffs are skipped. Unavailable or oversized file
contents fall back to diff-only review. Authentication, rate-limit, server, and
network errors fail the review instead of being treated as source code. Empty
PRs skip Gemini; PRs with only skipped files get a coverage comment without a
Gemini call. Partial reviews always use **COMMENT**, with up to 20 coverage
notes in the posted review, rather than approving changes that were not checked.
