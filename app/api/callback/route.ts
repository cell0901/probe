import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  // after user authorizes the git hub app the call back url will hit with some ?code=230958935 in the query param
  const param = req.nextUrl.searchParams
  const code = param.get("code")
  // this is the callback url user will see or hit
  // sending post request to this to get the access token of the user authorized our app
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      client_id: process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code: code
    })
  })

  const data = await res.json()
  console.log(data.access_token)

  //Now that you have a user access token, you can use the token to make API requests on behalf of the user. For example:
  // GET USERINFO
  const response = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${data.access_token}`,
      Accept: "application/vnd.github+json"
    }
  })
  console.log(await response.json())
  return NextResponse.json({ msg: "done" })
}
