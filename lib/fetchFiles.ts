// the function will be used to fetch the files on a pr 

import { GITHUB_API_URL } from "./utils";

/**
 * @params owner, repo name, pr number
 * @param token (the access token because if the repo isnt public)
 * 
 */
export async function fetchPrFiles(
    owner: string, repo: string, prNumber: number, token:string
){
    // fetch the all files of the pr number
    console.log(`https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/files`)
    const response = await fetch (`https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/files`, {
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github.v3+json" // is a custom media type used by the GitHub REST API. 
            // It signifies that you are requesting data in the JSON format, specifically tailored for version 3 of the GitHub API.
        }
    }) 

    const files = await response.json()

    // fetch full content for each file
    console.log('file raw url',files[0].raw_url )
    const filesWithContent = await Promise.all(
        files.map(async (file:any) => {
          try {
           const content = await fetch(file.raw_url).then( r => r.text()) // getting the content in text

           console.log("file:", file)
           return {
            filename: file.filename,
            status: file.status,
            patch: file.patch, // the contents that was actually added and remove from the file (the fix),
            fullContent: content,
            additions: file.additions, // n0. of lines added to the file
            deletions: file.deletions, // no. of lines removed from the file
            changes: file.changes // optional for use but returning if helpful later
           }

          } catch (e){
            console.log("some error while fetching the files contents", e) 
            return null;
          }      
        })
    )
    console.log(filesWithContent[0].filename)
    return filesWithContent.filter(Boolean) // this will remov or filter the values like null, 0 or unidenftified 
}