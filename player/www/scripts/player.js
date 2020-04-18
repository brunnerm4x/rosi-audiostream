/*
 * 
 * 		AUDIO Streaming Service Client
 * 			   Audio Playback
 * 
 * 			Playlist Functionality
 * 
 * 	ROSI - Realtime Online Payment with IOTA
 * 
 * 		   Proof of Concept / Example
 * 
 * 
 * 	Changed 18.03.2020
 * 
 * */


/*		Method Overview:
 * 
 * 	Player() 		... constructor
 * 
 * 	 .addToPlaylist(srv_stream, srv_pay, id_stream, start_init = true) ... adds stream to playlist,
 * 		srv_stream ... Streaming provider server (data)
 * 		srv_pay    ... ROSI - Payment server
 * 		id_stream  ... ID of stream on streaming provider server
 * 		start_init ... true: the initialization of streams in playlist is started after current 
 * 						stream is added, false: the stream is just added to the playlist
 * 
 * 	 .removeFromPlaylist(inx)	... Remove item on index inx from playlist
 * 
 *	 .movePlaylistPosition(oldinx, newinx)	... Move item on plylist from index 
 * 		oldinx 	... current position of item to be moved
 * 		newinx  ... new position of item to be moved to
 * 	
 * 	 .initNextStreams(manamount = false, manres = false, manrej = false) ... starts initialization
 * 		of streams according to preferences in .options object (.preinit streams) if no parameter
 * 		is set.
 * 		manamount  ... sets the amount of streams to be initialized (counting from current .inx)
 * 		manres, manrej ... (FOR INTERNAL USE) overrides resolve and reject functions of Promise
 * 
 *	.prebufferStream(no = -1, manres = false, manrej = false) ... pay for first few seconds 
 * 		of not playing stream and download those to make start instant
 * 		no ... index of title in playlist to be prebuffered, -1 means next title (if currently 
 * 				something is playing) or current title (if currently on STOP)
 * 		manres, manrej ... (FOR INTERNAL USE) overrides resolve and reject functions of Promise
 * 	
 *  .play(time = 0, inx = -1, manres = false, manrej = false) ... start playing 
 * 		time ... time in song to start (float seconds) (SPECIALTIME.RESUME or -10 can be used to 
 * 				  resume playing where last stop has been called)
 * 		inx  ... index of title in playlist to start (-1 means current .inx)
 * 		manres, manrej ... (FOR INTERNAL USE) overrides resolve and reject functions of Promise
 * 
 *  .addPlayInstant(srv_stream, srv_pay, id_stream, time)	... adds title to playlist and starts
 * 			playing this new title
 * 	
 *  .stop()	... stops playing instantly (can be used to pause, just resume with play, s.o.)
 *	
 *  .next()	... plays next title, stops if there is none
 * 
 * 	.previous() ... plays previous title, starts current from beginning if there is none
 * 	
 * 	.volume(setValue = -1) ... sets Volume for all current and future streams in playlist
 * 		setValue ... (float) value to set Volume (0 means muted, 1 is default), negative value
 * 					is ignored, returns the current / new value of volume
 * 
 * 	.setNextStartTime(startTime = 0) ...
 * 
 * 	.getPlaylist()	... returns current playlist in somewhat cleaned up format
 * 
 *  .getInfo()		... returns object with current infos of current (.inx) stream
 * 
 * 	.current(noElement = false)	... returns current element of Playlist (the object) if available
 * 									else returns the variable supplied in parameter "noElement"
 * 
 * 
 * 			"Public" Members:
 * 
 * 	.state ... (Read Only) state of playlist, according to STATE constants, defined in stream.js
 * 	.inx   ... (Read Only) index of current playing/waiting to play title in playlist
 * 	.options  ... general settings for playlist, see comments on definition below
 * 	.paymentRequested ... (Read Only) flag - payment is being processed / requested
 * 
 * */
 
// Possible states of Player (Included in Streamer file!)
/*
const STATE = {
		UINIT: 0,
		STOP: 1
		FINISHING: 9,
		PLAY: 10,
		
		GENERR: -1
};
*/

// Constructor of Player Object
let Player = function() 
{
	this.rosi = new RosiComm();
	
	this.playlist = [];		// [{ state, srv_stream, srv_pay, provider, suggestedCollateral, 
							// version_ssrv, info, providerId, streamId, streamer, prebuffered },...]
	this.inx = 0;			// Current index of playing/waiting to play stream in playlist
	this.state = STATE.UINIT;
	
	this.options = {
		preinit_streams: 5,			// Amount of streams on playlist to be hold preinitialized
		keep_played_title: true, 	// Do not delete stream from playlist after it finished playing?
		volume: 1.0,				// Volume of streams USE method .volume() to change!
		overreg_ppm_factor: 1.5,	// Faktor to be multiplied with real ppm costs to prevent warning
		repeat: 0,					// 0 ... no repeat, 1 ... repeat all (playlist), 2 ...rep. song
		init_next_timeout_play: 12000,	// Timeout after starting stream to wait beofre calling init next
		init_next_timeout_plchange: 1000	// Timeout after changing something in playlist stream to wait beofre calling init next
	};
	
	this.processes = {
		initializing: false,
		onInitEnd: [],
		prebuffering: false,
		onPrebufferEnd: []
	};
	
	this.paymentRequested = 0;	// Status flag that indicates that a payment has been requested
	this.playRequested = false;	// Status flag that player is trying to start a stream
	this.onPlayExecuted = [];	// Functions to be executed after current/next play() call finished
	
	this.onPlaylistUpdate = function() {};		// Handler to be called when playlist changes
	this.onStateChange = function() {};			// Handler to be called when state changes
	
	// Only one of the following timeouts should be active at a time -> cancel timeout Play BEFORE changing playlist
	this.timeoutInitNext = false;		// Timeout handler for timeouts of init
};

Player.posToPosHuman = Streamer.posToPosHuman;	// Helper function for time display

// Handler for errors in user set handlers
Player.prototype.externalHandlerErrorManager = function(e)
{
	console.error("Error occurred when trying to execute external handler: " + e);
	return;
}

Player.prototype.cancelInitTimeouts = function()
{
	clearTimeout(this.timeoutInitNext);
};

Player.prototype.scheduleInitNext = function(timeout)
{
	return setTimeout(() => {
		this.initNextStreams().then(r => {
			this.prebufferStream().then(r=> {}).catch(e => {
					console.error("(-2) Error Prebuffering Streams!");
				});
			}).catch(e => {
				console.error("(-1) Error Initializing Streams:" + e);
			});
	}, timeout);
};

// Add new stream to Playlist
Player.prototype.addToPlaylist = function(srv_stream, srv_pay, id_stream, start_init = true)
{	
	return new Promise((resolve, reject) => {
		
		this.cancelInitTimeouts();
		
		let ssrv = new ServerComm(srv_stream);
		
		ssrv.getTitleInfo(id_stream).then(r => {
		
			console.log("Connected to Server with SW Version", 
						r.version, "and ROSI-Provider:", r.rosi.provider);
						
			this.playlist.push({
					state: STATE.UINIT,
					srv_stream: srv_stream,
					srv_pay: srv_pay,
					id_stream: id_stream,
					provider: r.rosi.provider,
					suggestedCollateral: r.rosi.scoll,
					version_ssrv: r.version,
					info: r.info,
					providerId: '',
					streamId: '',
					streamer:  {},
					prebuffered: false
				});
			
			try { this.onPlaylistUpdate(); } catch(e) { this.externalHandlerErrorManager(e); };
			
			if(start_init)
			{
				// Start Initialization if streams according to settings
				this.timeoutInitNext = this.scheduleInitNext(this.options.init_next_timeout_plchange);
			}
			// Added stream to playlist, finished for now
			resolve(0);
		}).catch(e => {
			console.error("(-1) Error getting title Info:" + e);
			reject(-1);
			return;
		});
	});
};


// Remove Item at position inx from playlist
Player.prototype.removeFromPlaylist = function(inx, start_init = true)
{
	return new Promise((resolve, reject) => {
		
		this.cancelInitTimeouts();
		
		let remove = () => {
			if(this.inx > inx)
				this.inx --;
			
			try { this.playlist.splice(inx, 1)[0].streamer.kill(); } 
				catch(e) { console.warn("Couldn't kill streamer."); };
			try { this.onPlaylistUpdate(); } catch(e) { this.externalHandlerErrorManager(e); };
			resolve(0);
		};
		
		if(inx == this.inx)
		{
			// element to be removed is current element
			this.stop().then(r => {
				this.inx = 0;
				
				remove();
			}).catch(e => {
				console.error("Error stopping stream:", e);
				reject(e);
				return;
			});
		}
		else
		{
			remove();
		}	
			
		if(start_init)
		{
			// Start Initialization if streams according to settings
			this.timeoutInitNext = this.scheduleInitNext(this.options.init_next_timeout_plchange);
		}
	});
}

// Takes item from position oldinx to position newinx
Player.prototype.movePlaylistPosition = function(oldinx, newinx, start_init = true)
{
	this.cancelInitTimeouts();
	
	// check for valid indices
	if( oldinx < 0 || oldinx >= this.playlist.length ||
		newinx < 0 || newinx >= this.playlist.length )
		return -1;
	// Move item
	this.playlist.splice(newinx, 0, this.playlist.splice(oldinx, 1)[0]);
	// Correct current index if necessary
	if(oldinx == this.inx)
		this.inx = newinx;
	else
	{
		if(oldinx < this.inx && newinx >= this.inx)
			this.inx --;
		if(oldinx > this.inx && newinx <= this.inx)
			this.inx ++;
	}
	
	try { this.onPlaylistUpdate(); } catch(e) { this.externalHandlerErrorManager(e); };
	
	if(start_init)
	{
		// Start Initialization if streams according to settings
		this.timeoutInitNext = this.scheduleInitNext(this.options.init_next_timeout_plchange);
	}
	
	return 0;
}

// Handler for finished Inits
Player.prototype.execInitEnd = function()
{
	this.processes.initializing = false;

	if(this.processes.onInitEnd.length > 0)
	{
		// Execute first on PrebufferEnd Function
		this.processes.onInitEnd.shift()();
	}
}


Player.prototype.paymentHandler = function(amount, streamId)
{
	let title = this.playlist.filter(t => t.streamId == streamId);
	if(title.length < 1)
	{
		console.warn("Payment not possible, streamId is not valid");
		return true;
	}
	title = title[0];
	
	console.log("Payment for " + title.info.title + " requested. Amount:", amount, 'streamID:', title.streamId);
	
	this.paymentRequested ++;
	
	try
	{
		this.rosi.streamPayment(streamId, amount).then((channelInfo)=>{
			
			// Check if title is still valid
			title = this.playlist.filter(t => t.streamId == streamId);
			if(title.length < 1)
			{
				console.warn("Payment confirm not possible, streamId is not valid");
				return 1;
			}
			title = title[0];
		
			// inform player payment is settled
			this.paymentRequested --;
			if(typeof title.streamer != "undefined"){
			try{
				title.streamer.paymentFinished(channelInfo.channelId);
			}catch(e) { 
				console.warn("Error calling paymentFinished(), maybe stream deleted? E: " + e); 
			};}
			else
				console.warn("Payment was for removed stream.");
		}).catch(e => {
			// inform player payment is settled/error
			this.paymentRequested --;
			
			// Check if title is still valid
			title = this.playlist.filter(t => t.streamId == streamId);
			if(title.length < 1)
			{
				console.warn("Payment confirm not possible, streamId is not valid");
				return 1;
			}
			title = title[0];
			
			if(typeof title.streamer.paymentFinished == "function")
			{
				if(("" + e).indexOf("STREAM_NOT_PLAYING") > -1){
					console.log("Stream not playing, requesting no futher prepays.");
					title.streamer.doNotPrepay();
				}
				else
					console.error("Unhandled error while paying: " + e);
				
				// get at least the currently available channels instead of payment ... 	
				this.rosi.getActiveChannels(title.providerId).then((channels) => {
					title.streamer.paymentFinished(channels, false);
				}).catch(e => {
					if(e == 'Request Timeout')
					{
						// accept missing ROSI as payment
						title.streamer.paymentFinished('DUMMY_CHANNEL_ROSI_NOT_FOUND', true);	
						return 2;
					}
					console.error("Error occurred when trying to get Active Channels:" + e);
				});
			}
			else
				console.warn("Payment was for removed stream.");
		});
	}catch(e){ console.error("Error requesting streamPayment:" + e ); }
	
	return true;
}

// Check playlist and init streams on rosi as options specify
// Also create streamer object
Player.prototype.initNextStreams = function(manamount = false, manres = false, manrej = false)
{
	let _self = this;
	
	return new Promise((resolve, reject) => {
		
		if(manres !== false && manrej !== false)
		{
			resolve(0);	
			resolve = manres;
			reject = manrej;
		}
		
		if(this.processes.initializing)
		{
			console.log("Is already initializing!");
			this.processes.onInitEnd.push(()=>{ this.initNextStreams(manamount, resolve, reject); });
			return;
		}
		
		_self.processes.initializing = true;
		
		let i = this.inx - 1;
		let init_last = this.inx + (manamount ? manamount : this.options.preinit_streams);
		init_last = init_last >= this.playlist.length ? this.playlist.length : init_last;
		
		let title;

		// When successful, all numbered initStream_ functions are called one after another,
		// Starting with initStream() at the bottom ... 
		
		function initStream_1(r)
		{						
			title.providerId = r.providerId;
				
			_self.rosi.getActiveChannels(title.providerId).then(initStream_2).catch(e => {
				if(e == 'Request Timeout')
				{
					console.warn("ROSI has not responded/Is not installed.");
					initStream_2(['DUMMY_CHANNEL_ROSI_NOT_FOUND']);
					return;
				}
				console.error("Error occurred when trying to get ActiveChannels:" + e);
				// Continue with next stream
				initStream();
			});
		}
		
		function initStream_2(activeChannels)
		{
			title.streamer = new Streamer(title.srv_stream, title.id_stream, activeChannels);
			
			title.streamer.init(false).then(() => {
				
				console.log("INIT Finished " + title.info.title + ".");
				
				title.streamer.setVolume(_self.options.volume);
				sNfo = title.streamer.getInfo();
				
				// Init ROSI-Stream
				// Setting higher ppm than normal to prevent error messages from rosi 
				// plugin when buffering ...
				_self.rosi.initStream(title.providerId, 
					Math.ceil(sNfo.ppm * _self.options.overreg_ppm_factor)).then(initStream_3
				).catch(e => {
					if(e == 'Request Timeout')
					{
						console.warn("ROSI has not responded/Is not installed.");
						initStream_3({streamId: "DUMMYSTREAMID_ROSI_NOT_FOUND"});
						return;
					}
					console.error("Error occurred when trying to init stream:" + e);
					// Continue with next stream
					initStream();
				});
			}).catch(e => {
				console.error("Error occurred when trying to init streamer:" + e);
				// Continue with next stream
				initStream();
			});
		}
		
		function initStream_3(rstream)
		{
			title.streamId = rstream.streamId;
					
			// Connect eventhandler ...
			// Setup payment method
			title.streamer.setStreamId(title.streamId);
			title.streamer.setPaymentFunction((amount, streamId) => { 
				return _self.paymentHandler(amount,streamId); 
			} );

			// Set state of stream
			title.state = STATE.STOP;
			try{ _self.onStateChange(); } catch(e) { _self.externalHandlerErrorManager(e); };

			// Continue with next stream
			initStream();	
		}		
		
		//////////////////////////////////////////////////
		// Start initializing streams ...
		function initStream(){
			i ++;
			if(i >= init_last)
			{
				resolve(0);
				_self.execInitEnd();
				return;
			}
			
			title = _self.playlist[i];
			// Ignore already initialized streams ...
			if(title.state == STATE.UINIT)
			{
				_self.rosi.initProvider(title.provider, title.suggestedCollateral, 
									{ urlPayserv: title.srv_pay }).then(initStream_1).catch(e => {
					if(e == 'Request Timeout')
					{
						console.warn("ROSI has not responded/Is not installed.");
						initStream_1({ providerId: 'DUMMY_ROSI_NOT_ACTIVE' });
						return;
					}
					console.error("Error occurred when trying to init provider:" + e);
					// Continue with next stream
					initStream();
				});
			}
			else
				initStream();
		};
		initStream();			// This is the Start
	});
};

// Handler for finished Prebuffers
Player.prototype.execPrebufferEnd = function()
{
	console.log("Finished prebuffering.");
	
	if(this.processes.onPrebufferEnd.length > 0)
	{
		// Execute first on PrebufferEnd Function
		this.processes.onPrebufferEnd.shift()();
	}
}

// Init streamer object
// param no: stream index in playlist, -1 means next if current is not stop, else current
Player.prototype.prebufferStream = function(no = -1, manres = false, manrej = false)
{
	return new Promise((resolve, reject) => {
		
		if(manres !== false && manrej !== false)
		{
			resolve(0);	
			resolve = manres;
			reject = manrej;
		}
		
		if(this.processes.prebuffering)
		{
			console.log("Is already prebuffering!");
			this.processes.onPrebufferEnd.push(()=>{ this.prebufferStream(no, resolve, reject); });
			return;
		}
		
		if(no == -1)
			no = this.playlist[this.inx].state == STATE.STOP ? this.inx : this.inx + 1;
			
		if(no >= this.playlist.length){
			reject(0);		// No real error, just end of playlist
			return;
		}
		
		let title = this.playlist[no];
		if(title.prebuffered)
		{
			console.log("Title " + title.info.title + " already prebuffered.");
			this.execPrebufferEnd();
			resolve(0);
			return;
		}
		
		if(title.state == STATE.UINIT)
		{
			console.warn("(-2) Title not initialized. Needs to be initialized before prebuffering!");
			reject(-2);
			return;
		}
		
		console.log("Prebuffering title:", title.info.title, "...");
		
		/// If allowed by user, it is possible to prepay at this point to 
		/// make streaming start seamless
		console.log("Requesting PREpayment...");
		this.processes.prebuffering = true;
		
		try
		{
			// call to make start smoother
			// If current title is to be initialized, only pay if necessary.
			title.streamer.checkRequestPayment(((no == this.inx) ? false : true));
		}
		catch(e) 
		{
			console.error("(-3) Error occurred when requesting PREpayment, Error:" + e);
			this.processes.prebuffering = false;
			reject(-3);
			return;
		}
		// After payment, start to download buffers
		title.streamer.init(true).then(r => {
			title.prebuffered = true;
			this.processes.prebuffering = false;
			
			this.execPrebufferEnd();
			resolve(0);
		}).catch(e => 
		{
			this.processes.prebuffering = false;
			
			if(e == "OLD_DNF")
			{
				// schedule for later ... 
				console.warn("Streamer init exited with exit code OLD_DNF, trying again in 5 sec.");
				setTimeout(() => { this.prebufferStream(no, resolve, reject); }, 5000);
				return;
			}
			if(e == "Rosi-PaymentFailed")
			{
				// schedule for later ... 
				console.warn("Streamer init failed due to Rosi-Payment, trying again in 15 sec.");
				setTimeout(() => { this.prebufferStream(no, resolve, reject); }, 15000);
				this.processes.prebuffering = false;
				return;
			}
			else
			{
				
				this.execPrebufferEnd();
				console.error("(-1) Error init. title.streamer e: " + e);
				reject(-1);
			}
		});		
	});	
};


Player.prototype.playFinishExec = function()
{
	let toExecute = this.onPlayExecuted;
	this.onPlayExecuted = [];
	toExecute.forEach(ff => {	ff(); });
	
	try{ this.onStateChange(); } catch(e) { this.externalHandlerErrorManager(e); };
}

// Start playing on current position (index 0 if newly initialized)
Player.prototype.play = 
	function(time = 0, inx = -1, manres = false, manrej = false, isCurrentRequest = false)
{
	return new Promise((resolve, reject) => 
	{		
		this.cancelInitTimeouts();
		
		if(manres !== false && manrej !== false)
		{
			resolve(0);	
			resolve = manres;
			reject = manrej;
		};
		
		if(this.playlist.length == 0)
		{
			console.warn("(-3) Cannot play an empty playlist.");
			reject(-3);
			return;
		};
		
		if(this.playRequested && !isCurrentRequest)
		{
			// Schedule new request to be executed after current is finished.
			console.log("Play already requested - scheduling current Request for later.");
			this.onPlayExecuted.push(() => { this.play(time, inx, resolve, reject, false); });
			return;
		};
		
		this.playRequested = true;
		
		if(this.playlist[this.inx].state == STATE.PLAY)
		{
			this.stop().then(r => {
				this.play(time, inx, resolve, reject, true);
			}).catch(e => {
				console.error("(-1) Could not stop stream. E:" + e);
				this.playRequested = false;
				reject(-1);
				this.playFinishExec();
			});
			
			return;
		};
		
		if(inx != -1)
		{
			this.inx = inx;
			try { this.onPlaylistUpdate(); } catch(e) { this.externalHandlerErrorManager(e); };
		};
		
		if(this.playlist[this.inx].state == STATE.UINIT)
		{
			console.warn("Title not initialized. Needs to be initialized before playing!");
			this.processes.onInitEnd.push(()=>{ this.play(time, inx, resolve, reject, true); });
			
			if(! this.processes.initializing)
			{
				console.log("Title initialization is not even startet yet -> starting init...");
				this.initNextStreams(1).then(r => { 
					console.log("Init before play success.");
				}).catch(e => {
					console.error("(-1) Error Initializing Streams:" + e);
					this.playRequested = false;
					reject(-1);
					this.playFinishExec();
				});
			};
			return;
		};
			
		// Clean up
		if(this.inx >= 1 && !this.options.keep_played_title)
		{
			console.log("Deleted", this.inx, "tracks from playlist.");
			let oldInx = this.inx;
			this.inx = 0;
			this.playlist.splice(0, oldInx).forEach(t => { try { t.streamer.kill(); }catch(e){}});
			try { this.onPlaylistUpdate(); } catch(e) { this.externalHandlerErrorManager(e); };  
		};
		
		let title = this.playlist[this.inx];
		
		// Checks need to be done before starting, see below ...
		start = () => 
		{
			let strm = title.streamer;
			
			start_1 = (state) => 
			{								
				strm.play(time).then(r => 
				{							
					// Setting STOP HANDLER
					strm.setOnStopFunction(() => 
					{
						stop_1 = (state) =>
						{							
							title.state = STATE.STOP;
							
							// Start next
							if(this.inx < this.playlist.length - 1 && this.state == STATE.PLAY && 
								this.options.repeat != 2)
							{
								this.play(0, this.inx + 1);
								return;
							}
							else if(this.state == STATE.PLAY && this.options.repeat == 1)
							{
								this.play(0, 0);
								return;
							}
							else if(this.state == STATE.PLAY && this.options.repeat == 2)
							{
								this.play(0, this.inx);
								return;
							}
							
							this.state = STATE.STOP;
							try{ this.onStateChange(); } catch(e) 
										{ this.externalHandlerErrorManager(e); };
							return;
						}
						
						this.rosi.stopStream(title.streamId).then(stop_1).catch(e => {
							if(e == 'Request Timeout')
							{
								console.warn("ROSI has not responded/Is not installed.");
								stop_1({state:'ROSI_NOT_FOUND'});
								return;
							}
							console.error("Error occurred stopping stream: " + e);
							return;
						});
					}); 
					
					// finally start streaming :)
					// Set state
					this.state = STATE.PLAY;
					title.state = STATE.PLAY;
					try{ this.onStateChange(); } catch(e) { this.externalHandlerErrorManager(e); };
					
					// Finished
					console.log("Started playing Track No.", this.inx, "'" +
														this.playlist[this.inx].info.title + "'");
					this.playRequested = false;
					resolve(0);
					this.playFinishExec();
					
					// Start prebuffering next title
					// Start Initialization if streams according to settings
					this.timeoutInitNext = this.scheduleInitNext(this.options.init_next_timeout_play);
					
				}).catch(e => {
					console.error("Error occurred starting stream: " + e);
					return;
				});
			};
			
			
			// Start here
			this.rosi.startStream(title.streamId).then(start_1).catch(e => {
				if(e == 'Request Timeout')
				{
					console.warn("ROSI has not responded/Is not installed.");
					start_1({state:'ROSI_NOT_FOUND'});
					return;
				}
				console.error("Error occurred requesting start stream from rosi: " + e);
				return;
			});
		}

		// Start the Process...
		start();
	
	});
}


// Adds Title to Playlist then starts playing this title
Player.prototype.addPlayInstant = function(srv_stream, srv_pay, id_stream, time)
{
	return new Promise((resolve, reject) => {
		
		let handleError = (e) => {
			console.error("Error occurred when trying to instant play title:", e);
			reject(e);
		};
		
		this.stop().then(r => {
			this.addToPlaylist(srv_stream, srv_pay, id_stream, false).then(r => {
				this.play(time, this.playlist.length - 1).then(r => {
					
					resolve(0);
				}).catch(handleError);
			}).catch(handleError);
		}).catch(handleError);
	});
}

// Stop Playing / Pause
Player.prototype.stop = function()
{
	return new Promise((resolve, reject) => {

		if(this.playlist.length == 0 || this.state == STATE.UINIT || this.state == STATE.STOP)
			resolve(0);
		
		let title = this.playlist[this.inx];
		let strm = title.streamer;
		
		this.state = STATE.STOP;
		strm.stop();
		
		try{ this.onStateChange(); } catch(e) { this.externalHandlerErrorManager(e); };
		
		let stop_1 = (state) => {
			try
			{
				title.state = STATE.STOP;			
				this.state = STATE.STOP;
				try{ this.onStateChange(); } catch(e) { this.externalHandlerErrorManager(e); };
				
				resolve(0);
				return;
			}catch(e) 
			{
				console.error("Stream stopped. Error occurred handling: " + e);
			}
		};
		
		this.rosi.stopStream(title.streamId).then(stop_1).catch(e => {
			if(e == 'Request Timeout')
			{
				console.warn("ROSI has not responded/Is not installed.");
				stop_1({state:'ROSI_NOT_FOUND'});
				return;
			}
			console.error("Error occurred stopping stream: " + e);
			return;
		});	
	});
}


// Helper function to play next song in playlist
Player.prototype.next = function()
{
	return new Promise((resolve, reject) => {
		
		if(this.playlist.length == 0)
		{
			console.warn("(-3) Cannot play next on empty playlist.");
			reject(-3);
			return;
		}
		
		if(this.inx >= this.playlist.length - 1)
		{
			console.warn("(-2) This was the last song of the playlist!");
			this.stop().then(r => {
				reject(-2);
			}).catch(e => {
				reject(-2);
			});
			
			return;
		}
		
		this.play(0, this.inx + 1).then(r => {
			this.playRequested = false;
			resolve(0);
		}).catch(e => {
			console.error("(-1) Error trying to play: " + e);
			reject(-1);
		});
	});
}


// Helper function to play previous song in playlist
// --> ONLY works when options.keep_played_title == true !!
// resolves with value (-2) if no song before current and plays current song from beginning.
Player.prototype.previous = function()
{
	return new Promise((resolve, reject) => {
		
		if(this.playlist.length == 0)
		{
			console.warn("(-3) Cannot play previous on empty playlist.");
			reject(-3);
			return;
		}
		
		if(this.inx > 0)
		{
			// normal behaviour
			this.play(0, this.inx - 1).then(r => {
				resolve(0);
			}).catch(e => {
				console.warn("(-1) :" + e);
				reject(-1);
			});
			return;
		}
		
		// first song -> start from beginning
		this.play(0,0).then(r => {
			resolve(-2);
		}).catch(e => {
			console.warn("(-1) :" + e);
			reject(-1);
		});
	});
}


// Sets volume of streams (all in playlist and all future that are added to playlist)
// resolves with new volume value
// if param setValue is negative, volume is not set, just current value is returned.
Player.prototype.volume = function(setValue = -1)
{
	if(setValue >= 0)
	{
		this.options.volume = setValue;
		this.playlist.forEach(t => { 
			if(t.state != STATE.UINIT) 
				t.streamer.setVolume(setValue);
		});
	}
	
	return this.options.volume
}


// Set startTime for next play of current stream with option SPECIALTIME.RESUME
Player.prototype.setNextStartTime = function(startTime = 0)
{
	if(this.state == STATE.STOP && typeof this.playlist[this.inx] != undefined &&
		this.playlist[this.inx].state == STATE.STOP)
	{
		this.playlist[this.inx].streamer.nextStartTime = startTime;
		return 0;
	}
	return -1;
}

// returns current playlist info
// Dumps playlist to console (debugging)
Player.prototype.getPlaylist = function()
{
	return this.playlist.map(t => { 
		let i = t.info;
		i.state = t.state;
		
		return i;
	 });
}

// Returnes object with current stats, see object below
Player.prototype.getInfo = function()
{
	if(typeof this.playlist[this.inx] != 'undefined' && this.playlist[this.inx].state != STATE.UINIT)
		return this.playlist[this.inx].streamer.getInfo();
		
	return {
		state : STATE.UINIT,			// State code as defined in STATE object
		duration : 0,					// Duration of complete stream in seconds
		pos : 0,						// Position in seconds (float)
		pos_pc : 0,						// Position in percent of stream length
		ppm : 0,						// Price per minute of stream in iota
		volume : this.options.volume	// Currently set gain/volume value
	};
}


// Returns info on current element of Playlist (the object) if available, else returns <noElement>
Player.prototype.current = function(noElement = false)
{
	return (typeof this.playlist[this.inx] != 'undefined') ? 
			{	...this.playlist[this.inx].info, 
				...this.getInfo(), 
				provider: this.playlist[this.inx].provider,
				coverUrl: this.playlist[this.inx].srv_stream + '/cover/' + 
								this.playlist[this.inx].info.albumID
			} : noElement;
}



//// DEBUGGING  / EXAMPLE  USE  ////

/*
var p;

async function initexample() {
	
	p = new Player();
	let c = 0;
	
	c += await p.addToPlaylist("http://192.168.1.20:10010", "http://192.168.1.20:9000", 0, false);
	c += await p.addToPlaylist("http://192.168.1.20:10010", "http://192.168.1.20:9000", 1, false);
	c += await p.addToPlaylist("http://192.168.1.20:10010", "http://192.168.1.20:9000", 2, false);
	c += await p.addToPlaylist("http://192.168.1.20:10010", "http://192.168.1.20:9000", 3, false);
	c += await p.addToPlaylist("http://192.168.1.20:10010", "http://192.168.1.20:9000", 4, false);
	c += await p.addToPlaylist("http://192.168.1.20:10010", "http://192.168.1.20:9000", 5, false);
	
	if(c != 0)
		console.error("Error occurred when trying to initialize playlist!");
	else
		console.log("Playlist successfully initialized.");

};

initexample();

*/







