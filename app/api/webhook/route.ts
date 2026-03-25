import { reivewerPr } from "@/lib/reviewer";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) { // added this webhook url to the github app webhook url. any action like new pr added 
  // a post request to this will be sent
  console.log("the webhook was hit")
  const data = await req.json()
  console.log("json here", data)

  // extract key info
  const repo = data.repository
  const pr = data.pull_request
  const installation = data.installation
  const action = data.action

  if (action === 'opened' || action === 'synchronize') { // synchronize means if u do a commit to the branch 
    console.log('starting reivew')
    try {
      await reivewerPr({
        owner: repo.owner.login,
        repo: repo.name, // testing
        prNumber: pr.number, // 11
        installionId: installation.id, //83873487
        prTitle: pr.title, // Update this.txt
        prAuthor: pr.user.login, // 
        prBody: pr.body || 'not desc',
        headSha: pr.head.sha, //  commit sha (optional but sending)
      })

    } catch (e) {
      console.log('reivew failed', e)
    }
  }
  return NextResponse.json({
    received: true
  })


}

// Request {
//   method: 'POST',
//   url: 'https://localhost:3000/api/webhook',
//   headers: Headers {
//     host: '7e0e1e7db2a7.ngrok-free.app',
//     'user-agent': 'GitHub-Hookshot/1fd3ecb',
//     'content-length': '22081',
//     accept: '*/*',
//     'content-type': 'application/json',
//     'x-forwarded-for': '140.82.115.10',
//     'x-forwarded-host': '7e0e1e7db2a7.ngrok-free.app',
//     'x-forwarded-proto': 'https',
//     'x-github-delivery': '36950e20-caa8-11f0-974b-9685aa455a12',
//     'x-github-event': 'pull_request',
//     'x-github-hook-id': '582951668',
//     'x-github-hook-installation-target-id': '2348301',
//     'x-github-hook-installation-target-type': 'integration',
//     'accept-encoding': 'gzip',
//     'x-forwarded-port': '3000'
//   },
//   destination: '',
//   referrer: 'about:client',
//   referrerPolicy: '',
//   mode: 'cors',
//   credentials: 'same-origin',
//   cache: 'default',
//   redirect: 'follow',
//   integrity: '',
//   keepalive: false,
//   isReloadNavigation: false,
//   isHistoryNavigation: false,
//   signal: AbortSignal { aborted: false }
// }
