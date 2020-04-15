/*
 * 	Audio streaming server
 *
 * 	07.01.2020
 *
 * */


const http = require('http');
const fs = require('fs');
const request = require('request');



////////////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////		GLOBAL CONSTANTS & VARIABLES			////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////


let PORT = 10010;
let URL_PAYSERVER = "http://localhost:9000";
let PROVIDER = "rosipoc01";
let VERSION = "ROSI POC AUDIO 0.1";
let SUGGESTED_COLLATERAL = 200;
let STDCOMMENT = "";

const COVER_NAME = "/folder.jpg";
const DIR_DB = 'db';
const STREAMS_DB = "db/streams.json";
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

const URL_SLICE = 'slice';
const URL_COVER = 'cover';
const URL_SEARCH = 'search';
const URL_SRVINFO = 'info';
const MAX_LIST_RESULTS = 1000;

let albums = [];


//////////////////////   USE ENVIRONMENT VARIABLES IF AVAILABLE		////////////////////////////////
if(typeof process.env.npm_package_config_port != "undefined")
{
	PORT = parseInt(process.env.npm_package_config_port);	
	console.log("Using Environment Variable for PORT, value: " + PORT);
}
if(typeof process.env.npm_package_version != "undefined")
{
	VERSION = process.env.npm_package_version;
	console.log("Using Environment Variable for VERSION, value: " + VERSION);
}
if(typeof process.env.npm_package_config_provider == "string")
{
	PROVIDER = process.env.npm_package_config_provider;
	console.log("Using Environment Variable for PROVIDER, value: " + PROVIDER);
}
if(typeof process.env.npm_package_config_stdcomment == "string")
{
	STDCOMMENT = process.env.npm_package_config_stdcomment;
	console.log("Using Environment Variable for STDCOMMENT, value: " + STDCOMMENT);
}
if(typeof process.env.npm_package_config_payserver == "string")
{
	URL_PAYSERVER = process.env.npm_package_config_payserver;
	console.log("Using Environment Variable for URL_PAYSERVER, value: " + URL_PAYSERVER);
}
if(typeof process.env.npm_package_config_suggestedCollateral != "undefined")
{
	SUGGESTED_COLLATERAL = parseInt(process.env.npm_package_config_suggestedCollateral);
	console.log("Using Environment Variable for SUGGESTED_COLLATERAL, value: " + 
																		SUGGESTED_COLLATERAL);
}



////////////////////////////////////////////////////////////////////////////////////////////////////
/////////////////////////////			HELPERS				////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////

let streamInfoMapper = (s) => {
    let o = s.info;
    o.id = s.id;
    o.cover = "/" + URL_COVER + "/" + s.info.albumID;
    o.ppm = s.slice.price * 60 / s.slice.duration;
    o.provider = PROVIDER;
    return o;
};

let requestWebBalance = function(payID)
{
	return new Promise((resolve, reject) =>  {
		try
		{
			if(!Array.isArray(payID))
				payID = [payID];
			
			let psRequest = {
						action:		'getWebBalance', 
						payID:		payID
					};
					
			request.post(URL_PAYSERVER, {json: true, body: psRequest}, (err, res, body) => {
				if (!err && res.statusCode === 200) 
				{
					try
					{
						if(body.accepted == true)
							resolve(body.balances);
						else
							reject("REQUEST_NOT_ACCEPTED");
						return;
					}catch(e)
					{
						reject(e);
						return;
					}
				}
				else
				{
					reject(err);
					return;
				}
			});
		}
		catch(e)
		{
			console.error("Error when requesting balance: " + e);
			reject(e);
			return;
		}
	});
}




////////////////////////////////////////////////////////////////////////////////////////////////////
/////////////////////////////			SERVER				////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////


http.createServer(function(req, res) 
{
    console.log("Requesting url:", req.url);

    // As this should be public service, allow all websites to access it
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');
    res.setHeader('Access-Control-Expose-Headers', '*');
	
	/*  GET STREAM SLICE / STREAM SETUP INFORMATION  */
    if (req.url.split("/", 3)[1] == URL_SLICE) 	// get slice
    {
        let rawbuffer = '';
        req.on('data', function(data) {
            rawbuffer += data;
        });

        req.on('end', function() {
			
			let respondError = (e) => {
				console.error("Error serving slice request:", e);
				
				res.writeHead(200, {
                    'Content-Type': 'application/json'
                });
                res.end(JSON.stringify({
                    accepted: false,
                    error: 'REQUEST_ERROR'
                }));
			};
			
            try {
                let sreq;
                try {
                    sreq = JSON.parse(rawbuffer);
                } catch (e) {
                    // Invalid JSON - return empty response
                    res.writeHead(200);
                    res.end();
                    return;
                };
                // sreq.id : ID of stream is index in streams array
                // sreq.no: Number of slice of selected stream
                sreq.id = Number(sreq.id);
                sreq.id = sreq.id < 0 || sreq.id >= streams.length ? 0 : sreq.id;
				
                let stream = streams[sreq.id];
                let info = stream.info;
                sreq.no = Number(sreq.no);
                sreq.no = sreq.no < -1 || sreq.no >= stream.slice.count ? -1 : sreq.no;
                
                let payID = sreq.payID.replace(/\W/g, '');
				
				let respondSuccess = (paymentSuccess, remainingBalance) => {
					
					res.writeHead(200, {
						'Content-Type': stream.mime,
						'Server-Version': VERSION,
						'Stream-Id': sreq.id,
						'Stream-Title': info.title,
						'Stream-Album': info.album,
						'Stream-Artist': info.artist,
						'Stream-AlbumArtist': info.album_artist,
						'Stream-AlbumID': info.albumID,
						'Stream-Genre': info.genre,
						'Stream-Track': info.track,
						'Stream-Disc': info.disc,
						'Stream-Date': info.date,
						'Stream-Duration': info.duration,
						'Stream-Comment': (typeof info.comment == "string" ? 
																info.comment : STDCOMMENT),

						'Slice-No': sreq.no,
						'Slice-Of': stream.slice.length,
						'Slice-Duration': stream.slice.duration,

						/// ROSI SPACESAVERS ...
						'Rosi-Provider': PROVIDER,
						'Rosi-Accepted': paymentSuccess,
						'Rosi-Remaining': remainingBalance,
						'Rosi-Price': stream.slice.price,
						'Rosi-Collateral': SUGGESTED_COLLATERAL
					});

					if(sreq.no != -1)
						res.end(fs.readFileSync(stream.dir + sreq.no + '.' + stream.file));
					else
						res.end();		// Just send headers for initialisation

					console.log('Slice', sreq.no ,'sent. Remaining balance: ' + remainingBalance);
				};


				// slice no -1 is (free) init information (no stream data is sent, just header)
				if(sreq.no != -1 && stream.slice.price != 0)
				{
					/// PAYMENT /// 
					
					let psRequest = {
						action:		'claimDeposit', 
						payID:		payID, 
						amount:		stream.slice.price
					};
					
					request.post(URL_PAYSERVER, {json: true, body: psRequest}, (err, res, body) => {
						if (!err && res.statusCode === 200) 
						{
							try
							{
								respondSuccess(body.accepted == true ? 'true' : 'false',
											   Number(body.available));
											   
								/// PAYMENT FINISH /// 
								
								return;
							}catch(e)
							{
								respondError(e);
								return;
							}
						}
						else
						{
							respondError(err);
							return;
						}
					});
				}
				else
				{
					requestWebBalance(payID).then(balances => {
						respondSuccess('true', balances.reduce((a,v) => a + v));
					}).catch(e => {
						console.error("Error when getting payID balances: " + e);
						console.log("Continuing anyway...");
						respondSuccess('true', 0);
					});
				}
				
            } catch (e) {
                respondError(e);
                return;
            }
        });
        
    
    } 
    else if (req.url.split("/", 3)[1] == URL_SEARCH) 					  /*   SEARCH FOR STREAM  */
    {
        let rawbuffer = '';
        req.on('data', function(data) {
            rawbuffer += data;
        });

        req.on('end', function() {
            try {
                let sreq;
                try {
                    sreq = JSON.parse(rawbuffer);
                } catch (e) {
                    // Invalid JSON - return empty response
                    res.writeHead(200);
                    res.end();
                    return;
                };

                // return requested data
                res.writeHead(200, {
                    'Content-Type': 'application/json'
                });

                if (sreq.type === 'generalTitle') 
                {
                    // Sanitisation of filters
                    let filters = {};
                    let activefilters = [];
                    for (let i = 0; i < RELEVANT_TAGS.length; i++) {
                        if (typeof sreq[RELEVANT_TAGS[i]] !== 'undefined') {
                            activefilters.push(RELEVANT_TAGS[i]);
                            filters[RELEVANT_TAGS[i]] = sreq[RELEVANT_TAGS[i]];
                        }
                    }

                    let sresult = [];
                    // Get elements
                    if (activefilters.length === 0) {
                        // return the newest few elements
                        sresult = streams.slice(-1 * MAX_LIST_RESULTS);
                    } else {
                        sresult = streams.filter(s => {
                            for (let i = 0, rf = false; i < activefilters.length; i++, rf = false) {
                                let filter = activefilters[i];
                                let values = filters[filter];
                                for (let j = 0; j < values.length; j++) {
                                   if (s.info[filter].toLowerCase().indexOf(values[j].toLowerCase()) 
										> -1) 
                                    {
                                        rf = true;
                                        break;
                                    }
                                }
                                if (!rf)
                                    return false;
                            }
                            return true;
                        });
                    }

                    res.end(JSON.stringify(sresult.map(streamInfoMapper)));
                    console.log('Sent Streamlist.');
                } 
                else if (sreq.type === 'album') 
                {
                    let searchString = typeof sreq.searchString === 'string' ?
						sreq.searchString : '';
                    res.end(JSON.stringify(albums.filter(a => 
						a.album.toLowerCase().indexOf(searchString.toLowerCase()) > -1)));
                    console.log('Sent Albumlist.');
                } 
                else if (sreq.type === 'albumTitles') 
                {
                    res.end(JSON.stringify(streams.filter(s => 
						s.info.albumID === sreq.albumID).map(streamInfoMapper)));
                    console.log('Sent Albumtitles.');
                }



            } catch (e) {
                console.error("Error serving slice request:", e);
                res.writeHead(200, {
                    'Content-Type': 'application/json'
                });
                res.end(JSON.stringify({
                    accepted: false,
                    error: 'REQUEST_ERROR'
                }));
                return;
            }
        });
        
       
    } 
    else if (req.url.split("/", 3)[1] == URL_SRVINFO) 				/*  GET GENERAL SERVER INFORMATION  */
    {
        let rawbuffer = '';
        req.on('data', function(data) {
            rawbuffer += data;
        });

        req.on('end', function() {
            try {
                let sreq;
                
                try {
                    sreq = JSON.parse(rawbuffer);
                } catch (e) {
                    // Invalid JSON - return empty response
                    res.writeHead(200);
                    res.end();
                    return;
                };

                // return requested info
                res.writeHead(200, {
                    'Content-Type': 'application/json'
                });
                res.end(JSON.stringify({
                    accepted: true,
					version: VERSION,
					provider: PROVIDER,
					maxListResults: MAX_LIST_RESULTS,
					suggestedCollateral: SUGGESTED_COLLATERAL
					// more info to be added here when necessary ... 
                }));
   
            } catch (e) {
                console.error("Error serving slice request:", e);
                res.writeHead(200, {
                    'Content-Type': 'application/json'
                });
                res.end(JSON.stringify({
                    accepted: false,
                    error: 'REQUEST_ERROR'
                }));
                return;
            }
        });
    } 
    else if (req.url.split("/", 3)[1] == URL_COVER) 				/*  GET ALBUM COVER  */
    {
        let rawbuffer = '';
        req.on('data', function(data) {
            // No data should be sent
        });

        req.on('end', function() 
        {
            try 
            {
				let albumId = req.url.split("/", 4)[2];
				
				if(fs.existsSync('db/audio/' + albumId + COVER_NAME))
				{
					res.writeHead(200, {
						'Content-Type': 'image/jpeg'
					});
					
					res.end(fs.readFileSync('db/audio/' + albumId + COVER_NAME)); 
					 
					return;
				}
				else
					throw Error("Not found.");
            }
            catch (e) 
            {
				res.writeHead(200, {
						'Content-Type': 'image/jpeg'
				});
					
				res.end(fs.readFileSync('player/www/images/cover_default.jpg')); 
            }
        });
    } 
    else 
    {
        res.writeHead(404, {
            'Content-Type': 'text/html'
        });
        res.end("Site not found.");
    };

}).listen(PORT);


////////////////////////////////////////////////////////////////////////////////////////////////////
/////////////////////////////			INIT				////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////


const streams = JSON.parse(fs.readFileSync(STREAMS_DB)).map((s, i) => { return {...s, id: i}; });

streams.forEach(s => {
    if (albums.filter(a => a.albumID == s.info.albumID).length === 0) {
        albums.push({
            albumID: s.info.albumID,
            album: s.info.album,
            artist: s.info.album_artist,
            date: s.info.date,
            genre: s.info.genre,
            cover:  "/" + URL_COVER + "/" + s.info.albumID,
            provider: PROVIDER
        });
    }
});

console.log("Available Albums:");
console.log(albums.map(a => a.album).join('\n'));

console.log("Server listening on Port", PORT);
