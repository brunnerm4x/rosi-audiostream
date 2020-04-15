/*
 * 	Audio stream manager
 *
 * 	07.01.2020
 *
 * */

const http = require('http');
const fs = require('fs');
const formidable = require('formidable');
const {
    spawn,
    execSync
} = require('child_process');




////////////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////		GLOBAL CONSTANTS & VARIABLES			////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////

let VERSION = "ROSI POC AUDIO 0.1";
let PORT = 10011;
let SLICE_DURATION = 10;
let FORMAT_ENDING = ".flac";
let FORMAT_FFMPEGCODEC = "flac";
let FORMAT_MIME = "audio/flac";

const DIR_DB = 'db';
const STREAMS_DB = "db/streams.json";

const COVER_NAME = "folder.jpg";
const RELEVANT_TAGS = 	[	'title', 
							'album', 
							'artist', 
							'album_artist', 
							'genre', 
							'track', 
							'disc', 
							'date'
						];
const OPTIONAL_TAGS = [		'comment'
						];

if(typeof process.env.npm_package_version != "undefined")
{
	VERSION = process.env.npm_package_version;
	console.log("Using Environment Variable for VERSION, value: " + VERSION);
}						
if(typeof process.env.npm_package_config_portms != "undefined")
{
	PORT = parseInt(process.env.npm_package_config_portms);	
	console.log("Using Environment Variable for PORT, value: " + PORT);
}
if(typeof process.env.npm_package_config_msslicedur != "undefined")
{
	SLICE_DURATION = parseInt(process.env.npm_package_config_msslicedur);	
	console.log("Using Environment Variable for SLICE_DURATION, value: " + SLICE_DURATION);
}
if(typeof process.env.npm_package_config_msformatending == "string")
{
	FORMAT_ENDING = process.env.npm_package_config_msformatending;
	console.log("Using Environment Variable for FORMAT_ENDING, value: " + FORMAT_ENDING);
}
if(typeof process.env.npm_package_config_msformatffmpeg == "string")
{
	FORMAT_FFMPEGCODEC = process.env.npm_package_config_msformatffmpeg;
	console.log("Using Environment Variable for FORMAT_FFMPEGCODEC, value: " + FORMAT_FFMPEGCODEC);
}
if(typeof process.env.npm_package_config_msformatmime == "string")
{
	FORMAT_MIME = process.env.npm_package_config_msformatmime;
	console.log("Using Environment Variable for FORMAT_MIME, value: " + FORMAT_MIME);
}

// html file containing upload form
const upload_html = fs.readFileSync("manager/upload_file.html");
const delete_html = fs.readFileSync("manager/delete.html");
const upload_path = "manager/tmp/";



////////////////////////////////////////////////////////////////////////////////////////////////////
/////////////////////////////			HELPERS				////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////

// file ... path to temp file
// info ... {title, album,... (more added later)}
let addFileToDB = function(file, info, price, res) {
    try {
        console.log("Getting metadata ...");
        let finfo = JSON.parse(execSync("ffprobe -v quiet -print_format json -show_format \"" + file + "\""));
        finfo = finfo.format;
        let techinfo = {
            duration: Math.ceil(Number(finfo.duration)),
            price: price
        };

        for(let i = 0; i < RELEVANT_TAGS.length; i++) 
        {
            let rkey = Object.keys(finfo.tags).find(key => key.toLowerCase() === RELEVANT_TAGS[i]);
            if (typeof rkey == "undefined" && typeof info[RELEVANT_TAGS[i]] === "undefined") {
                console.error("Necessary tag " + RELEVANT_TAGS[i] + " not found!");
                res.writeHead(200);
                res.end("Necessary tag \"" + RELEVANT_TAGS[i] + "\" not found! " +
                    "\nPlease fill in all of the following tags in your file: " +
                    RELEVANT_TAGS.join(', '));
                return;
            }

            info[RELEVANT_TAGS[i]] = typeof info[RELEVANT_TAGS[i]] === "undefined" ?
                finfo.tags[rkey] : info[RELEVANT_TAGS[i]];
        }
        
        for(let i = 0; i < OPTIONAL_TAGS.length; i++)
        {
			let rkey = Object.keys(finfo.tags).find(key => key.toLowerCase() === OPTIONAL_TAGS[i]);
			if(typeof rkey != "undefined" && typeof info[OPTIONAL_TAGS[i]] === "undefined")
				info[OPTIONAL_TAGS[i]] = finfo.tags[rkey];
		}

        // Convert track to number and remove possible slashes like (1/10) format
        info.track = Number(info.track.split("/", 2)[0]);

        console.log("Info Object:", info);
        console.log("Adding " + file + " to database...");

        // Convert and move ...
        if (typeof info.albumID === "undefined") 
        {
            info.albumID = info.album.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 10) + Date.now();
            console.warn("No AlbumID provided - created new one.");
        }
        console.log('This Song belongs to AlbumID:', info.albumID);

        let destDir = 'db/audio/' + info.albumID + '/';

        if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, {
                recursive: true
            });
        }

        techinfo.sliceDuration = typeof techinfo.sliceDuration == 'undefined' ?
            SLICE_DURATION : techinfo.sliceDuration;
        techinfo.sliceAmount = Math.ceil(techinfo.duration / techinfo.sliceDuration);
        techinfo.fileBaseName = info.track + FORMAT_ENDING;

        console.log("Now converting file using FFMPEG...");
        
        //  	----------     DEFINE STEPS      ---------------------
        let spliceAudio = (callback) => 
        {
			// ------ Get segmented audio files  ---------
			// ffmpeg -i zuhilfe.mp3 -map_metadata -1 -vn -c:a flac 
			//	-f segment -segment_time 10 %03d.test05.flac
			
			let ffmpeg = spawn('ffmpeg', ['-i', file, '-map_metadata', '-1', '-vn', '-c:a', 'flac',
				'-f', 'segment', '-segment_time', techinfo.sliceDuration, '-v', 'quiet', 
				destDir + '%d.' + techinfo.fileBaseName
			]);

			ffmpeg.stdout.on('data', data => {
				console.error(data.toString());
			});
			ffmpeg.stderr.on('data', data => {
				console.log(data.toString());
			});

			ffmpeg.on('close', code => {
				if (code == 0) {
					console.log("Audio slicing finished successfully.");
					callback(true);
				} 
				else 
				{
					console.error("FFMPEG finished with exit code:", code);
					callback(false);
				}
			});
		};
		
        let extractCover = (callback) => 
        {
			// ------ Get cover of album  ---------fs
			//ffmpeg -i fernando.flac -an -vcodec mjpeg folder.jpg
			
			let ffmpeg = spawn('ffmpeg', ['-i', file, '-an', '-vcodec', 'mjpeg', '-v', 'quiet', 
										'-vf', 'scale=480:480', destDir + COVER_NAME 
			]);

			ffmpeg.stdout.on('data', data => {
				console.error(data.toString());
			});
			ffmpeg.stderr.on('data', data => {
				console.log(data.toString());
			});

			ffmpeg.on('close', code => {
				if (code == 0) {
					console.log("Cover extraction finished successfully.");
					callback(true);
				} 
				else 
				{
					console.error("FFMPEG finished with exit code:", code);
					callback(false);
				}
			});
		};
		
		//  Delete temp-file and add info to db (file)
		let finishSetup = () => 
		{
			fs.unlink(file, () => {
				console.log("Deleted temporary file.");
			});


			let streams = JSON.parse(fs.readFileSync(STREAMS_DB));
			info.duration = techinfo.duration,
				streams.push({
					"info": info,
					"slice": {
						"duration": techinfo.sliceDuration,
						"length": techinfo.sliceAmount,
						"price": techinfo.price
					},
					"dir": destDir,
					"file": techinfo.fileBaseName,
					"mime": FORMAT_MIME
				});

			fs.writeFileSync(STREAMS_DB, JSON.stringify(streams));

			res.writeHead(200);
			res.write('File uploaded, converted and added to database.\n');
			res.write('AlbumID: ' + info.albumID);
			res.end();
		};
		
		
		let handleError = (e) => {
			console.error("Error occurred Converting File: " + e);
			res.writeHead(500);
			res.end("Internal Server Error.");
		};
		
		
		//	CONNECT THE FUNCTIONS
		spliceAudio((success) => {
			if(!success)
			{
				handleError("Splicing file failed.");
				return;
			}
			if(fs.existsSync(destDir + COVER_NAME)) 
			{
				// Cover file already exists, no need to replace it
				finishSetup();
				return;
			}
			extractCover((success) => {
				if(!success)
					console.warn("Could not extract cover image.");
				// Continue anyway
				finishSetup();
			});
		});
		
    } catch (e) {
        console.error("Error occurred Converting File: " + e);
        res.writeHead(500);
        res.end("Internal Server Error.");
    }
}




////////////////////////////////////////////////////////////////////////////////////////////////////
/////////////////////////////			SERVER				////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////

http.createServer(function(req, res) {

    console.log("Requesting url:", req.url);

    if (req.url == '/upload') 
    {
        res.writeHead(200);
        res.write(upload_html);
        return res.end();
    }
    else if (req.url == '/delete')
    {
        res.writeHead(200);
        res.write(delete_html);
        return res.end();
    }
    else if (req.url == '/change') 
    {
        res.writeHead(200);
        res.write("Not yet implemented.");
        return res.end();
    } 
    else if(req.url == '/albums.js')
    {
		res.writeHead(200);
        res.write("var albums = " + JSON.stringify(JSON.parse(fs.readFileSync(STREAMS_DB)).filter((t,i,l) => l.findIndex(lt => lt.info.albumID == t.info.albumID) == i).map(s => { 
			return {	albumID: s.info.albumID, 
						album: s.info.album,
						artist: s.info.album_artist,
						date: s.info.date,
						genre: s.info.genre
					}; 
		})) + ";\n");
        return res.end();
	}
    else if (req.url == '/fileupload') 
    {
        try {
            let form = new formidable.IncomingForm();
            form.parse(req, function(err, fields, files) {

                let price = Number(fields['price_per_slice']);
                
                let info = {};
                if (fields.albumID != "") {
                    info.albumID = fields.albumID;
                }
                for (let i = 0; i < 25 &&
                    typeof fields["addtag_name_" + i] != "undefined" &&
                    fields["addtag_name_" + i] != ""; i++) {
                    info[fields["addtag_name_" + i]] = fields["addtag_value_" + i];
                }

                // oldpath : temporary folder to which file is saved to
                let oldpath = files.filetoupload.path;
                let newpath = upload_path + files.filetoupload.name;

                // copy the file to a new location
                fs.rename(oldpath, newpath, function(err) 
                {
                    try {
                        if (err) throw err;

                        addFileToDB(newpath, info, price, res);
                    } catch (e) {
                        console.error("Error occurred E02:" + e);
                        res.writeHead(500);
                        res.end("Internal Server Error.");
                    };
                });
            });
        } catch (e) {
            console.error("Error occurred E01:" + e);
            res.writeHead(500);
            res.end("Internal Server Error.");
        };
    }
    else if (req.url == '/albumdelete') 
    {
        try {
            let form = new formidable.IncomingForm();
            form.parse(req, function(err, fields, files) {

                let albumID = fields['albumID'];
                
				console.log("ablumID to delete:", albumID);
				
				// Delete folder ...
				try
				{
					execSync("rm -rf db/audio/" + albumID);
					console.log("Deleted data folder.");
					
					fs.writeFileSync(STREAMS_DB, JSON.stringify(JSON.parse(fs.readFileSync(STREAMS_DB))
						.filter(t => t.info.albumID !== albumID)
					));
					console.log("Deleted from DB-File.");
					
					res.writeHead(200);
					res.end("Delete SUCCESS.");
				}catch(e)
				{
					console.error("Error occurred when trying to DELETE album: " + e 
						+ " Please check database for consistency!");
						
					res.writeHead(500);
					res.end("Internal Server Error.");
				}; 
            });
        } catch (e) {
            console.error("Error occurred E01:" + e);
            res.writeHead(500);
            res.end("Internal Server Error.");
        };
    }
}).listen(PORT);

console.log("Available functions:");
console.log("  http://127.0.0.1:" + PORT + "/upload - add new streams");
console.log("  http://127.0.0.1:" + PORT + "/delete - delete albums");
console.log("  http://127.0.0.1:" + PORT + "/change - change info");





