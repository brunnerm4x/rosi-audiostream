# ROSI Demo Project

### *audiostream* is an example for ROSI (Realtime Online Streaming with IOTA) Payments

For general information about ROSI see https://rosipay.net

* Install Dependencies
  * nodejs (https://nodejs.org/en/)
  * ffmpeg (for Debian-Like Systems with apt: `sudo apt-get install ffmpeg`)
	
* Initial Setup
  1. Clone repository `git clone -b master --single-branch https://github.com/brunnerm4x/rosi-audiostream.git`
  2. `cd rosi-audiostream`
  3. `npm i`

* Setup Database for Streaming Server
  1. `npm run manage-streamserver`
  2. Open `http://localhost:10011` (default settings, server also prints URLs on startup)
  3. Upload the files you want - they will be automatically converted. All files with the same AlbumID will be later displayed in the same album - if you do not specify an albumID the script will generate one and thus the uploaded file will get in a new album.

  * Other functions of management server should be used analogous.

* Start streaming service
  * `npm start`

* Start webserver for player page
  * `npm run start-webserver`

* Build Player for offline use or to be used with other webserver
  The simple server script provided uses special URLs, to strip the client files from these, run the following command:
  * `npm run build-website`
  This will create a folder named `player.localbuild` with the website able to run locally (just open `index.htm` with firefox).

* Configuration Of Servers
  * `npm config set rosi-audiostream:port 10010` to set the port of the streaming-server to 10010
  * `npm config set rosi-audiostream:provider rosipoc01` to set the provider name of the streaming-server to rosipoc01
  * ... see options in package.json file `config` object.

