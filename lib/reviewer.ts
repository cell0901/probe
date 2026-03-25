import { fetchPrFiles } from "./fetchFiles";
import { generateJWT } from "./generateJwt";
import { getLLMReview } from "./getLLMReview";

export interface PRinfo {
    owner: string;
    repo: string;
    prNumber: number;
    installionId: number // installtion id is assigned to each user who installs and authorizes your app
    prTitle:string;
    prAuthor : string // the author who raised the pr
    prBody: string
    headSha? :string
}
export async function reivewerPr (info: PRinfo){ // function to reiview the pr
    
    // 1 . installation token
    const token = await getInstalltionId(info.installionId)
    console.log(' got installation token')

    // 2 . fetch pr files
    const files = await fetchPrFiles(info.owner, info.repo, info.prNumber, token)
    console.log("fetched the pr files")

    // 3. get llm review
    const review = await getLLMReview(files, info)

    // 4 . post review to github
    await postReview(token, info, review)
    console.log('posted to github')
}


async function getInstalltionId(installationId: number){

    const jwt = generateJWT() // get the jwt for the github app to get access tokens
    const response = await fetch (`https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jwt}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    }
  );
  const data = await response.json()

  return data.token
}


// the function to post review on the pr
/**
 * 
 * @param token the access token from the installation id
 * @param info  the info the pr info when the pr is created
 * @param review the llm review response
 */
async function postReview (token:string, info:PRinfo, review:any){ 
    // create inline comments
    const comments = review.issues
    .filter ( (i:any)=> i.line) // fitler out issues which dont have any line numbers:
    .slice(0.20) // only gets first 20 issues from the llm review. too much can be too over wheleming
    .map( (issue: any)=> ({ // returns new array or comments with file path, line and body to sent to post
        path: issue.file,
        line: issue.line,
        body: `**${issue.severity.toUpperCase()}**: ${issue.issue}\n\n💡 **Suggestion**: ${issue.suggestion}`
    }))

    // creating the final review body
    const body = `## 🤖 AI Code Review

${review.summary}

${review.issues.length > 0 ? `
### ⚠️ Issues Found
${review.issues.map((i: any) => 
  `- **[${i.severity}]** \`${i.file}${i.line ? ':' + i.line : ''}\` - ${i.issue}`
).join('\n')}
` : ''}

${review.improvements.length > 0 ? `
### 💡 Suggestions
${review.improvements.map((imp: any) => 
  `- \`${imp.file}${imp.line ? ':' + imp.line : ''}\` - ${imp.suggestion}`
).join('\n')}
` : ''}
`

     const response = await fetch(
    `https://api.github.com/repos/${info.owner}/${info.repo}/pulls/${info.prNumber}/reviews`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        body,
        event: review.status === 'APPROVE' ? 'APPROVE' : 'COMMENT',
        comments
      })
    }
  );

  if (!response.ok){
    const err = await response.text()
    console.log("Failed to post review:", err)
  }
  console.log('review posted successfully')
}

