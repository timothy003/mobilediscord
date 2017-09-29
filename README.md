# MobileDiscord

MobileDiscord is a custom third-party mod for Discord (https://discordapp.com/).

Neither the code nor its author are affiliated with Discord.

## Dependencies

~~Flask~~ (is now supplied by Google Cloud by default)

## Hosting

1. Create a Google Cloud account at https://cloud.google.com.
2. Create a new project in the web console, name it whatever you want. Write down the project ID (it appears below the project name field in the new project prompt).
3. Download Google Cloud SDK.
4. Run `gcloud auth login`. Your browser will open an authentication page. Login and give permission to SDK.
5. Run `gcloud config set project $PROJECT_ID`.
6. Clone this repository and navigate to `$REPO_ROOT/appengine`.
7. Run `gcloud app regions list`. You'll get a list of available app regions.
8. Run `gcloud app create --region $REGION`, where $REGION is one of the regions from the above list.
9. Run `gcloud app deploy`.
10. Congratulations! MobileDiscord is now available at https://**$PROJECT_ID**.appspot.com/channels/@me
