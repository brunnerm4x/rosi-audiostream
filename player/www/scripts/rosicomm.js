/*
 * 
 *   ROSI - Raltime Online Streaming with IOTA -- PoC Page
 * 
 * 			Wrapper for communication with plugin
 * 
 * 
 * 	 Public RosiComm Variables:	
 * 
 * */
 
const ROSI_VERSION = '0.0.1';

// rosi communication class
let RosiComm = function()
{
	let _self = this;
	
	this.rosiFound = false; 	// When rosi has responded at least once in the session, 
								// ign
	
	this.openPromises = [];		// [{reqId: int, resolve: func, reject: func, watchdog: timer}, ...]

	this.elToPlugin = document.getElementById('rosi_communication_to_plugin');
	this.elToWebsite = document.getElementById('rosi_communication_to_website');
	
	// Calls from plugin - handlers
	this.elToWebsite.addEventListener('ping', (e)=>{ this.handlePing(e, _self); });	
	this.elToWebsite.addEventListener('initialize_provider', (e)=>{ this.handleInitProvider(e, _self); });
	this.elToWebsite.addEventListener('initialize_stream', (e)=>{ this.handleInitStream(e, _self); });
	this.elToWebsite.addEventListener('start_stream', (e)=>{ this.handleStartStream(e, _self); });
	this.elToWebsite.addEventListener('stop_stream', (e)=>{ this.handleStopStream(e, _self); });
	this.elToWebsite.addEventListener('close_stream', (e)=>{ this.handleCloseStream(e, _self); });
	this.elToWebsite.addEventListener('get_provider_channels', (e)=>{ this.handleActiveChannels(e, _self); });	
	this.elToWebsite.addEventListener('pay_stream', (e)=>{ this.handleStreamPayment(e, _self); });	
	this.elToWebsite.addEventListener('pay_single', (e)=>{ this.handleSinglePayment(e, _self); });	
	this.elToWebsite.addEventListener('status', (e)=>{ this.handleRosiStatus(e, _self); });	

	// try to check on rosi ... 
	setTimeout(() => {
		this.ping().then(()=>{
			console.log("Found ROSI Plugin!");
			this.rosiFound = true;
		}).catch(e => { 
			alert("No Communication With ROSI-WebExtension Possible.");
			console.error("Could not ping ROSI plugin: " + e); 
		})}, 500);
}

RosiComm.prototype.newRequestId = function()
{
	return Date.now();
}

RosiComm.prototype.addOpenPromise = function(reqId, resolve, reject, timeout = 0)
{
	if(timeout != 0)
		timeout = setTimeout(() => {  
			reject("Request Timeout");  		// Reject Promise
			this.getOpenPromise(reqId); 		// Delete Promise from list
		}, timeout);
	this.openPromises.push({reqId: reqId, resolve: resolve, reject: reject, watchdog: timeout});
}

// Returns promise of reqId and deletes it from the array
RosiComm.prototype.getOpenPromise = function(reqId)
{
	let promise = this.openPromises.filter(promise => promise.reqId === reqId);
	this.openPromises = this.openPromises.filter(promise => promise.reqId !== reqId);
	
	if(promise.length > 0)
	{
		clearTimeout(promise[0].watchdog);
	}
	
	return ((promise.length == 0) ? ({ 
			resolve: function(d){ console.warn('Unknown promise requested!' + reqId); }, 
			reject: function(d){ console.warn('Unknown promise requested!' + reqId); }
		}) : (promise[0]));
}

// data needs member reqId
RosiComm.prototype.sendRequest = function(eventName, data)
{
	return new Promise((resolve, reject) => {
				
		try
		{
			let watchdog = 0;
			if(eventName == 'ping')
				watchdog = 2000;
			else if(!this.rosiFound)
				watchdog = 250;

			this.addOpenPromise(data.reqId, resolve, reject, watchdog);
			
			let event = new CustomEvent(eventName, { detail: data });
			this.elToPlugin.dispatchEvent(event);
		}
		catch(e)
		{
			console.log('Could not send Request' + eventName + ': ' + e);
			reject(e);
			return;
		};
	});
}



// ==================== API CALLS =========================

// Registers the provider on the plugin
// A registered provider is needed to be able to initialize a stream
// 
// The plugin will (if user approves it) make sure a funded flash channel exists 
// Also it will request the security key from the server with 'getproviderkey' request to payserver (*1)
//
// provider: (string) provider, human readable identification of content provider
//
// suggestedCollateral: Flash-channel collateral used, if user doesn't specify own fixed amount
//
// options: (object), optional: {
//     urlPayserv: (string) url to payserver, complete; default: [url of webserver]/payserv
// }
//
// ad *1:  PROVIDER SECURITY KEY
//     Problem: malicious actor provides fake stream with same provider string as 
//              honest provider
//     Solution: when provider is first registered in app (first appearance) and a flash
//              channel is set up successfully, at least the ID and channel root address has to be 
//              completely stored  until user plugin sends delete request;
//              Everytime this provider is initialized in the plugin, the plugin sends the 
//				ID and an random index (from 20 to 80) of the last used channel to the 
//              provider server, which has to return the string of 10 signs of the root address from 
//              the given index to prove that the server is indeed who it says it is.
//
//	return: resolve({providerId: [registered provider id string], state: string}), reject([Error])
//

// Get status of ROSI Plugin and streams/provider
RosiComm.prototype.ping = function(options = {})
{
	const eventName = 'ping';
	
	options.version = ROSI_VERSION;
	
	let data = { reqId: this.newRequestId() };
			
	return this.sendRequest(eventName, data);
}

RosiComm.prototype.handlePing = function(event, _self)
{
	let data;
	
	try
	{
		data = JSON.parse(event.detail);
		
		if(data.accepted === true && typeof data.reqId === 'number')
		{
			// Request success
			var promise = _self.getOpenPromise(data.reqId);
			promise.resolve(0);
		}
		else
		{
			// Reject
			_self.getOpenPromise(data.reqId).reject(new Error("Data from plugin is garbage."));
		}
	}
	catch(error)
	{
		// TODO: Handle openPromises Array? - add types of promises - delete all of type?
		console.log('Received invalid ping message:' + error);
		return;
	}
}


RosiComm.prototype.initProvider = function(provider, suggestedCollateral, options = {})
{
	const eventName = 'initialize_provider';
	
	options.version = ROSI_VERSION;
	
	let data = {
				provider: provider,
				url:  window.location.origin,
				suggestedCollateral: suggestedCollateral,
				options: options,
				reqId: this.newRequestId()
			};
			
	return this.sendRequest(eventName, data);
}

RosiComm.prototype.handleInitProvider = function(event, _self)
{
	let data;
	
	try
	{
		data = JSON.parse(event.detail);

		if(data.accepted === true && typeof data.reqId === 'number')
		{
			// Request success
			_self.getOpenPromise(data.reqId).resolve({providerId: data.providerId, state: data.state});
		}
		else if(typeof data.reqId === 'number')
		{
			// Reject
			_self.getOpenPromise(data.reqId).reject(data.error);
		}
	}
	catch(error)
	{
		// TODO: Handle openPromises Array? - add types of promises - delete all of type?
		console.log('Error provider init: ' + error);
		return;
	}
}

//	Requests initialization of stream
//  (when using suggested settings)
// 	ATTENTION: Provider has to be initialized before initStream is called
//	
//	providerId: initialized providerId, got from initProvider
//
//	ppm: (maximum) price per minute
//    you have to specify a maximum price of media that is played with this stream instance
//    this is shown user in player request message (if activated) and overview in plugin, 
//    also the plugin does not allow streams with a higher price
//
//	options: (object): not used yet
//
//	returns: promise -> resolve({streamId: random string, state: string}); reject('INVALID_PROVIDERID' | 'UNKNOWN_ERROR')
//
RosiComm.prototype.initStream = function(providerId, ppm, options = {})
{
	const eventName = 'initialize_stream';
	
	options.version = ROSI_VERSION;
	
	let data = {
				providerId: providerId,
				ppm: ppm,
				options: options,
				reqId: this.newRequestId()
			};
			
	return this.sendRequest(eventName, data);
}

RosiComm.prototype.handleInitStream = function(event, _self)
{
	let data;
	
	try
	{
		data = JSON.parse(event.detail);

		if(data.accepted === true && typeof data.reqId === 'number')
		{
			// Request success
			_self.getOpenPromise(data.reqId).resolve({streamId: data.streamId, state: data.state});
		}
		else if(typeof data.reqId === 'number')
		{
			// Reject
			_self.getOpenPromise(data.reqId).reject(data.error);
		}
	}
	catch(error)
	{
		// TODO: Handle openPromises Array? - add types of promises - delete all of type?
		console.log('Error stream init: ' + error);
		return;
	}
}

// If another stream is active, no access is allowed -> you have to ask user to stop other
// players/close tab/click stop on plugin page
//
// streamId: (string), ID got from initStream
RosiComm.prototype.startStream = function(streamId, options = {})
{
	const eventName = 'start_stream';
	
	options.version = ROSI_VERSION;
	
	let data = {
				streamId: streamId,
				options: options,
				reqId: this.newRequestId()
			};
			
	return this.sendRequest(eventName, data);
}

RosiComm.prototype.handleStartStream = function(event, _self)
{
	let data;
	
	try
	{
		data = JSON.parse(event.detail);

		if(data.accepted === true && typeof data.reqId === 'number')
		{
			// Request success
			_self.getOpenPromise(data.reqId).resolve({state: data.state});
		}
		else if(typeof data.reqId === 'number')
		{
			// Reject
			_self.getOpenPromise(data.reqId).reject(data.error);
		}
	}
	catch(error)
	{
		// TODO: Handle openPromises Array? - add types of promises - delete all of type?
		console.log('Error stream start: ' + error);
		return;
	}
}

// Request stream stop - after that other streams can be started, but no stream payments for this 
// stream are allowed anymore
//
// streamId: (string), ID got from initStream
RosiComm.prototype.stopStream = function(streamId, options = {})
{
	const eventName = 'stop_stream';
	
	options.version = ROSI_VERSION;
	
	let data = {
				streamId: streamId,
				options: options,
				reqId: this.newRequestId()
			};
			
	return this.sendRequest(eventName, data);
}

RosiComm.prototype.handleStopStream = function(event, _self)
{
	let data;
	
	try
	{
		data = JSON.parse(event.detail);

		if(data.accepted === true && typeof data.reqId === 'number')
		{
			// Request success
			_self.getOpenPromise(data.reqId).resolve({state: data.state});
		}
		else if(typeof data.reqId === 'number')
		{
			// Reject
			_self.getOpenPromise(data.reqId).reject(data.error);
		}
	}
	catch(error)
	{
		// TODO: Handle openPromises Array? - add types of promises - delete all of type?
		console.log('Error stream stop: ' + error);
		return;
	}
}

// Deletes stream object - please call after stream is not needed anymore to increase performance
// Can only be called after stream has played at least once for 1 second! (to prevent initpay - attack)
RosiComm.prototype.closeStream = function(streamId, options = {})
{
	const eventName = 'close_stream';
	
	options.version = ROSI_VERSION;
	
	let data = {
				streamId: streamId,
				options: options,
				reqId: this.newRequestId()
			};
			
	return this.sendRequest(eventName, data);
}

RosiComm.prototype.handleCloseStream = function(event, _self)
{
	let data;
	
	try
	{
		data = JSON.parse(event.detail);

		if(data.accepted === true && typeof data.reqId === 'number')
		{
			// Request success
			_self.getOpenPromise(data.reqId).resolve({state: data.state});
		}
		else if(typeof data.reqId === 'number')
		{
			// Reject
			_self.getOpenPromise(data.reqId).reject(data.error);
		}
	}
	catch(error)
	{
		// TODO: Handle openPromises Array? - add types of promises - delete all of type?
		console.log('Error stream close: ' + error);
		return;
	}
}

// Get array of channel - IDs
// Returns promise, resolve([ChannelIds]), reject(error)
RosiComm.prototype.getActiveChannels = function(providerId, options = {})
{
	const eventName = 'get_provider_channels';
	
	options.version = ROSI_VERSION;
	
	let data = {
				providerId: providerId,
				options: options,
				reqId: this.newRequestId()
			};
			
	return this.sendRequest(eventName, data);
}

RosiComm.prototype.handleActiveChannels = function(event, _self)
{
	let data;
	
	try
	{
		data = JSON.parse(event.detail);
		
		if(data.accepted === true && typeof data.reqId === 'number')
		{
			// Request success
			var promise = _self.getOpenPromise(data.reqId);
			promise.resolve(data.channelIds);
		}
		else
		{
			// Reject
			_self.getOpenPromise(data.reqId).reject(new Error('Request of provider channels failed.'));
		}
	}
	catch(error)
	{
		// TODO: Handle openPromises Array? - add types of promises - delete all of type?
		console.log('Received invalid active channels message:' + error);
		return;
	}
}

// Send payment to provider
RosiComm.prototype.streamPayment = function(streamId, amount, options = {})
{
	const eventName = 'pay_stream';
	
	options.version = ROSI_VERSION;
	
	let data = {
				streamId: streamId,
				amount: amount,
				options: options,
				reqId: this.newRequestId()
			};
			
	return this.sendRequest(eventName, data);
}

RosiComm.prototype.handleStreamPayment = function(event, _self)
{
	let data;
	
	try
	{
		data = JSON.parse(event.detail);
		
		if(data.accepted === true && typeof data.reqId === 'number')
		{
			// Request success
			var promise = _self.getOpenPromise(data.reqId);
			promise.resolve(data.channelInfo);
		}
		else
		{
			// Reject
			_self.getOpenPromise(data.reqId).reject(new Error(data.error));
		}
	}
	catch(error)
	{
		// TODO: Handle openPromises Array? - add types of promises - delete all of type?
		console.log('Error on stream payment:' + error);
		return;
	}
}


// Send single payment to provider
RosiComm.prototype.singlePayment = function(providerId, amount, options = {})
{
	const eventName = 'pay_single';
	
	options.version = ROSI_VERSION;
	
	let data = {
				providerId: providerId,
				amount: amount,
				options: options,
				reqId: this.newRequestId()
			};
			
	return this.sendRequest(eventName, data);
}

RosiComm.prototype.handleSinglePayment = function(event, _self)
{
	let data;
	
	try
	{
		data = JSON.parse(event.detail);
		
		if(data.accepted === true && typeof data.reqId === 'number')
		{
			// Request success
			var promise = _self.getOpenPromise(data.reqId);
			promise.resolve(data.txInfo);
		}
		else
		{
			// Reject
			_self.getOpenPromise(data.reqId).reject(new Error(data.error));
		}
	}
	catch(error)
	{
		// TODO: Handle openPromises Array? - add types of promises - delete all of type?
		console.log('Received invalid status message:' + error);
		return;
	}
}



// Get status of ROSI Plugin and streams/provider
RosiComm.prototype.rosiStatus = function(providerId = false, streamId = false, options = {})
{
	const eventName = 'status';
	
	options.version = ROSI_VERSION;
	
	let data = {
				providerId: providerId,
				streamId: streamId,
				options: options,
				reqId: this.newRequestId()
			};
			
	return this.sendRequest(eventName, data);
}

RosiComm.prototype.handleRosiStatus = function(event, _self)
{
	let data;
	
	try
	{
		data = JSON.parse(event.detail);
		
		if(data.accepted === true && typeof data.reqId === 'number')
		{
			// Request success
			var promise = _self.getOpenPromise(data.reqId);
			promise.resolve(data.status);
		}
		else
		{
			// Reject
			_self.getOpenPromise(data.reqId).reject(new Error(data.error));
		}
	}
	catch(error)
	{
		// TODO: Handle openPromises Array? - add types of promises - delete all of type?
		console.log('Received invalid status message:' + error);
		return;
	}
}


