import { fetchPrFiles } from "./fetchFiles";
import { generateJWT } from "./generateJwt";
import { getLLMReview } from "./getLLMReview";
import { postReview } from "./postReview";

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
    const files = await fetchPrFiles(info.owner, info.repo, info.prNumber, token)
    console.log("fetched the pr files")

    // 3. get llm review
    const review = await getLLMReview(files, info)

    // 4 . post review to github
    await postReview(token, info, review, files)
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
