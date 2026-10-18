import { fetchPrFiles } from "./fetchFiles";
import { generateJWT } from "./generateJwt";
import { getLLMReview } from "./getLLMReview";
import { postReview } from "./postReview";
import type { Review } from "./postReview";

export interface PRinfo {
    owner: string;
    repo: string;
    prNumber: number;
    installionId: number // installtion id is assigned to each user who installs and authorizes your app
    prTitle:string;
    prAuthor : string // the author who raised the pr
    prBody: string
    headSha: string
}
export async function reivewerPr (info: PRinfo){ // function to reiview the pr
    
    // 1 . installation token
    const token = await getInstalltionId(info.installionId)
    console.log(' got installation token')

    // 2 . fetch pr files
    const { files, notes } = await fetchPrFiles(info.owner, info.repo, info.prNumber, token, info.headSha)
    console.log("fetched the pr files")

    if (files.length === 0 && notes.length === 0) {
      console.log("No changed files to review")
      return
    }

    // 3. get llm review
    const review: Review = files.length > 0
      ? await getLLMReview(files, info)
      : {
          status: "COMMENT",
          summary: "No reviewable text diffs were available. See the coverage notes below.",
          issues: [],
          improvements: [],
        }

    // 4 . post review to github
    await postReview(token, info, review, files, notes)
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
