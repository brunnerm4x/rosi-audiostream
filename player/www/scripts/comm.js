/*
 * 
 * 		AUDIO Streaming Service Client
 * 		   Communication with Server
 * 
 * 	ROSI - Realtime Online Payment with IOTA
 * 
 * 		   Proof of Concept / Example
 * 
 * 
 * 	Changed 19.01.2020
 * 
 * */

const URL_SLICE = '/slice';
const URL_SEARCH = '/search';
const URL_SRVINFO = '/info';

let ServerComm = function(url)
{
	this.url = url;
	this.info = {};
	
	try
	{
		this.getServerInfo();
	}catch(e) {
		console.error("Could not request info from server " + e);
	}
};

ServerComm.prototype.getServerInfo = function()
{
	return new Promise((resolve, reject) => {
		
		let req = new XMLHttpRequest();
		
		req.open('POST', this.url + URL_SRVINFO, true);
		req.setRequestHeader('Content-Type', 'application/json');
		req.responseType = 'json';
		
		// Handle data
		req.onload = () => {
			
			this.info = req.response;
			resolve(req.response);
			return;
		};
		
		req.addEventListener('error', () => { reject('Request Error.'); });
		req.addEventListener('abort', () => { reject('Request Aborted.'); });
		
		// Request slice
		req.send(JSON.stringify({}));
	});
}

ServerComm.prototype.getSlice = function(id, no, payID)
{
	return new Promise((resolve, reject) => {
		try
		{
			let req = new XMLHttpRequest();
			
			req.open('POST', this.url + URL_SLICE, true);
			req.setRequestHeader('Content-Type', 'application/json');
			req.responseType = 'arraybuffer';
			
			// Handle data
			req.onload = () => {
				
				if(req.getResponseHeader('Rosi-Accepted') != 'true')
				{
					reject('Rosi-PaymentFailed');
					return;
				}

				resolve({
					mime: req.getResponseHeader('Content-Type'),
					version: req.getResponseHeader('Server-Version'),
					info : {
							id : 		req.getResponseHeader('Stream-Id'),
							title: 		req.getResponseHeader('Stream-Title'),
							album: 		req.getResponseHeader('Stream-Album'),
							artist: 	req.getResponseHeader('Stream-Artist'),
							album_artist: req.getResponseHeader('Stream-AlbumArtist'),
							genre: 		req.getResponseHeader('Stream-Genre'),
							track: 		req.getResponseHeader('Stream-Track'),
							disc: 		req.getResponseHeader('Stream-Disc'),
							date: 		req.getResponseHeader('Stream-Date'),
							duration: 	Number(req.getResponseHeader('Stream-Duration')), 
							albumID: 	req.getResponseHeader('Stream-AlbumID'),
							comment: 	req.getResponseHeader('Stream-Comment') 
						},
					slice: {
						duration: 	Number(req.getResponseHeader('Slice-Duration')),
						number: 	Number(req.getResponseHeader('Slice-No')),
						length: 	Number(req.getResponseHeader('Slice-Of'))
					},
					rosi: {
						remaining: 	Number(req.getResponseHeader('Rosi-Remaining')),
						price: 		Number(req.getResponseHeader('Rosi-Price')),
						provider: 		req.getResponseHeader('Rosi-Provider'),
						scoll: 		Number(req.getResponseHeader('Rosi-Collateral')),
					},
					audioData: req.response
				});
				return;
			};
			
			req.addEventListener('error', () => { reject('Request Error.'); });
			req.addEventListener('abort', () => { reject('Request Aborted.'); });
			
			// Request slice
			req.send(JSON.stringify({
					id: id, 
					no: no, 
					payID: payID 
				}));
		}catch(e)
		{
			reject(e);
		}
	});
};

ServerComm.prototype.getTitleInfo = function(id)
{
	return new Promise((resolve, reject) => {
		
		this.getSlice(id, -1, '').then(r => {
			
			resolve(r);
			return;
		}).catch(e => {
			reject(e);
			return;
		});
	});
}

// get Array of available streams
// SearchParams: object: { 'title', 'album', 'artist', 'album_artist', 'genre', 'track', 'disc', 'date' }
// Where every subobject is an array and multiple entries are treated with logical OR (eg multiple titles),
// when multiple subobjects are specified (eg album and artist) this is treated like logical AND.
ServerComm.prototype.getAvailableList = function(searchParams)
{
	return new Promise((resolve, reject) => {
		
		let req = new XMLHttpRequest();
		
		req.open('POST', this.url + URL_SEARCH, true);
		req.setRequestHeader('Content-Type', 'application/json');
		req.responseType = 'json';
		
		// Handle data
		req.onload = () => {
			
			resolve(req.response);
			return;
		};
		
		req.addEventListener('error', () => { reject('Request Error.'); });
		req.addEventListener('abort', () => { reject('Request Aborted.'); });
		
		// Request slice
		searchParams.type = 'generalTitle';
		req.send(JSON.stringify(searchParams));
		
	});
};


// Get array of available albums, filter by searchString (has to be in 'album' string)
ServerComm.prototype.getAvailableAlbums = function(searchString)
{
		return new Promise((resolve, reject) => {
		
		let req = new XMLHttpRequest();
		
		req.open('POST', this.url + URL_SEARCH, true);
		req.setRequestHeader('Content-Type', 'application/json');
		req.responseType = 'json';
		
		// Handle data
		req.onload = () => {
			
			resolve(req.response);
			return;
		};
		
		req.addEventListener('error', () => { reject('Request Error.'); });
		req.addEventListener('abort', () => { reject('Request Aborted.'); });
		
		// Request slice
		req.send(JSON.stringify({type: 'album', searchString: searchString}));
		
	});
};


// Get array of streams contained in album by albumID
ServerComm.prototype.getAlbumTitles = function(albumID)
{
		return new Promise((resolve, reject) => {
		
		let req = new XMLHttpRequest();
		
		req.open('POST', this.url + URL_SEARCH, true);
		req.setRequestHeader('Content-Type', 'application/json');
		req.responseType = 'json';
		
		// Handle data
		req.onload = () => {
			resolve(req.response);
			return;
		};
		
		req.addEventListener('error', () => { reject('Request Error.'); });
		req.addEventListener('abort', () => { reject('Request Aborted.'); });
		
		// Request slice
		req.send(JSON.stringify({type: 'albumTitles', albumID: albumID}));
		
	});
};


