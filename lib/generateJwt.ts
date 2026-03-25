import jwt from "jsonwebtoken";
import fs from "fs"
// this function will be called again and again and new token will be generated when new pr comes a repo of the user who installed this app
export function generateJWT() {
  const appId = process.env.GITHUB_APP_ID // need this github app to sent to post request to api.github.com with jwt singed 
  // since gitub while decoding the jwt needs to know which app is that

  // the private key needs to be the app private key so github can understand the app and give access token which can be used 
  // for read and write access to the users who installed the app
  const privateKey = fs.readFileSync(process.env.GITHUB_APP_PRIVATE_KEY!, "utf8") // using 

  const now = Math.floor(Date.now() / 1000)

  const signedJwt = jwt.sign({
    iat: now,
    exp: now + (10 * 60), // 10 minutes exp
    iss: appId
  }, privateKey, { algorithm: "RS256" }) // github only understand this method RS256

  return signedJwt
}
