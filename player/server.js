/*
 * 	Audio streaming server
 *
 * 	07.01.2020
 *
 * */


const http = require('http');
const fs = require('fs');

let PORT = 10012;
let MAX_SUB_DIRS = 2;

const DEFAULT_URL = '/html/index.htm';
const REQMIMETYPES = {
    img: 'image/svg+xml',
    img_lossy: 'image/jpeg',
    css: 'text/css',
    js: 'application/javascript',
    html: 'text/html',
    dl: 'application/zip'
};

if(typeof process.env.npm_package_version != "undefined")
{
	VERSION = process.env.npm_package_version;
	console.log("Using Environment Variable for VERSION, value: " + VERSION);
}						
if(typeof process.env.npm_package_config_portws != "undefined")
{
	PORT = parseInt(process.env.npm_package_config_portws);	
	console.log("Using Environment Variable for PORT, value: " + PORT);
}
if(typeof process.env.npm_package_config_wsmaxsubdirs != "undefined")
{
	MAX_SUB_DIRS = parseInt(process.env.npm_package_config_wsmaxsubdirs);	
	console.log("Using Environment Variable for MAX_SUB_DIRS, value: " + MAX_SUB_DIRS);
}

let sanitizeStringArray = function(arr) {
    try {
        for (let i = 0; i < arr.length; i++) {
            arr[i] = arr[i].replace(/[^A-Za-z0-9-_]/g, '');
        }

        return arr;
    } catch (e) {
        console.error("Error sanitizing string array: ", e);
        return [];
    }
};

http.createServer(function(req, res) {

    console.log("Requesting url:", req.url);

    if (req.url === '/') {
        req.url = DEFAULT_URL;
        console.log('--> Defaulting to ' + DEFAULT_URL);
    }
    if (req.url === '/plugin') {
        req.url = "/dl/plugin";
        console.log('--> Redirecting to /dl/plugin');
    }

    // Request page
    // FILENAMES: only one dot is allowed - to set fileextention
    // NO OTHER DOTS IN FILENAME ALLOWED - Sanitizer will kill it!
    if (req.url.split('/', 3).length == 3) {
        let rawbuffer = '';
        req.on('data', function(data) {
            rawbuffer += data;
        });

        req.on('end', function() 
        {
            try {
				let dispFilename = false;
                let spliturl = req.url.split('/', MAX_SUB_DIRS + 2);
                let levels = spliturl.length;
                let file = sanitizeStringArray(spliturl[levels - 1].split('.')).filter(s => s != '');
                let type = sanitizeStringArray(spliturl.slice(1, 2))[0];
                spliturl = sanitizeStringArray(spliturl.slice(2, levels - 1)).filter(s => s != '');
                
                if(typeof REQMIMETYPES[type] == "undefined")
					throw Error("Invalid Request.");
                
                // Special url /plugin for downloading the plugin install package
                if(type == "dl" && file == "plugin")
                {					
					let version = {l1: 0, l2: 0, l3: 0, filename: ""};
					fs.readdirSync("../plugin/").forEach(f => {
						let v = f.split('-')[1].split('.').map(Number);
						// find newest version
						if(	(v[0] > version.l1) ||
							(v[0] == version.l1 && v[1] > version.l2) ||
							(v[0] == version.l1 && v[1] == version.l2 && v[2] >= version.l3))
						{
							version.l1 = v[0];
							version.l2 = v[1];
							version.l3 = v[2];
							version.string = v.join('.');
							version.filename = f;
						}
					});
					console.log("Serving client with plugin V " + version.string + " ...");
					res.writeHead(200, {
						'Content-Type': REQMIMETYPES[type],
						'Content-Disposition': "attachment; filename=\"" + version.filename + "\""
					});
					res.end(fs.readFileSync("../plugin/" + version.filename));
					return;
				}

                res.writeHead(200, {
                    'Content-Type': REQMIMETYPES[type]
                });
                res.end(fs.readFileSync('www' + '/' + spliturl.join('/') + '/' + file.join('.')));

            } catch (e) {
                console.error("Error serving slice request:", e);
                res.writeHead(200, {
                    'Content-Type': 'text/html'
                });
                res.end("An fatal error occurred.");
                return;
            }
        });
    } else {
        res.writeHead(404, {
            'Content-Type': 'text/html'
        });
        res.end("ERROR 404: Page not found.");
    }

}).listen(PORT);

console.log("Server listening on Port", PORT);
