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
