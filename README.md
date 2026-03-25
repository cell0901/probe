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
