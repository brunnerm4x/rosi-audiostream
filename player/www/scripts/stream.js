/*
 * 
 * 		AUDIO Streaming Service Client
 * 			   Audio Playback
 * 
 * 	ROSI - Realtime Online Payment with IOTA
 * 
 * 		   Proof of Concept / Example
 * 
 * 
 * 	Changed 26.01.2020
 * 
 * */
 
 
// Possible states of Streamer
const STATE = {
		UINIT: 0,
		STOP: 1,
		FINISHING: 9,
		PLAY: 10,
		
		GENERR: -1
};
	
const SPECIALTIME = {
	RESUME: -10
};

// Construct new Streamer object
let Streamer = function(url, id, payID = [], options = {})
{
	this.id = id;
	this.state = STATE.UINIT;
	this.server = new ServerComm(url);
	
	this.audioCtx = new window.AudioContext();
	this.gainNode = this.audioCtx.createGain();
	this.gainNode.connect(this.audioCtx.destination);
	
	this.options = {
		prebuffer: 4,		// Number of slices to be buffered
		manageBuffersIntervalTime: 500,
		lowBalanceSecStream: 31,	// threshold for onbalancelow, in seconds of stream prepayed
		payAmountSec: 60,		// Amount of seconds of stream that should be payed in one payment
		payRateLimDelay: 5000,		// Amount of ms to be minimum time between two pay requests
		prepayAllowed: true			// Set if prepaying is allowed. Sets only until first play!
	};
	this.options = {...this.options, ...options};
	
	this.info = {};
	this.rosi = {};
	this.slice = {};
	this.payID = [];
	this.payIDBalance = {};
	
	this.addPayID(payID);
	
	this.sliceBuffers = [];
	this.current = {
		buffer: {},
		source: {},
		number: 0,
		startTime: 0,
		duration : 0
	};
	this.next = {
		buffer: {},
		source: {},
		number: 0,
		startTime: 0,
		duration: 0
	};
	this.manageBuffersInterval = false;
	this.oninitsuccess = () => {};
	
	this.streamId = "";
	this.requestPayment = (amount, streamId) => { console.warn( " --- No pay function set. --- " );  return 0; };
	this.paymentRequested = false;
	this.onPaymentFinished = [];		// Array of functions to be executed once, after payment
	this.onStop = [];					// Array of functions xecuted when state is changed from 
										// PLAY or FINISHING to STOP -> Not called on init()
	this.errorCounter = {};				// Intended for various error counters in methods ...
	this.nextStartTime = 0;				// Start time if play(SPECIALTIME.RESUME) is requested
	this.payRateLimiter = false;		// Is set to true when pay req., reset by timeout
	
	this.successfulPayments = 0;		// Counter for successful payments to decide load of slice
};


// Stops everything, tries to prepare for garbage collection
Streamer.prototype.kill = function()
{
	clearInterval(this.manageBuffersInterval);
	this.stop();
	this.sliceBuffers = [];
	
	for (var property in this) {
	  if (this.hasOwnProperty(property) && property != 'kill') 
	  {
			delete this[property];
	  }
	}
}


// Set function that is called if payment is needed 
// payfunc(amount)
Streamer.prototype.setPaymentFunction = function(payfunc)
{
	this.requestPayment = payfunc;
}


Streamer.prototype.setStreamId = function(streamId)
{
	this.streamId = streamId;
}


// Stop instance of streamer to request payments while not set to state play()
Streamer.prototype.doNotPrepay = function()
{
	this.options.prepayAllowed = false;
	console.log("Will not request Payment until streamer is set to play.");
}


// Adds new payID if not existing
Streamer.prototype.addPayID = function(payID, addPayment = false)
{
	if(Array.isArray(payID))
	{
		payID.forEach((id) => { this.addPayID(id); });
		return;
	}
	
	if(payID !== false && addPayment !== false)
	{
		if(!this.payIDBalance.hasOwnProperty(payID))
			this.payIDBalance[payID] = addPayment;
		else
			this.payIDBalance[payID] += addPayment;
	}
	
	if(payID && this.payID.indexOf(payID) < 0)
		this.payID.push(payID);	
}

// Call this function once payment is cleared
Streamer.prototype.paymentFinished = function(payID = false, success = true)
{
	console.log("Payment finished for", this.info.title);
	
	this.paymentRequested = false;
	
	let pps = this.rosi.price / this.slice.duration;
	let payAmount = Math.ceil(this.options.payAmountSec * pps);
	this.rosi.remaining += payAmount
	this.addPayID(payID, payAmount);
	this.successfulPayments ++;
		
	let toExecute = this.onPaymentFinished;
	this.onPaymentFinished = [];
	toExecute.forEach(ff => {	ff(); });
}

// Check if payment is needed and request payment
// Set prepay to true to always pay as long as you are not already paying
Streamer.prototype.checkRequestPayment = function(prepay = false)
{		
	// Check if payment need to be requested
	let pps = this.rosi.price / this.slice.duration;
	
	for (let id in this.payIDBalance) 
	{
		if (this.payIDBalance.hasOwnProperty(id) && this.payID.indexOf(id) < 0) 
		{
			delete this.payIDBalance[id];
		}
	}
	
	this.rosi.remaining = Object.values(this.payIDBalance).reduce((acc, b) => acc + b, 0);
	
	// console.log("payIDBalance:", this.payIDBalance);

	if((this.rosi.remaining < pps * this.options.lowBalanceSecStream || prepay) && 
		this.paymentRequested == false && this.payRateLimiter === false &&
		(this.state == STATE.PLAY || this.state == STATE.FINISHING || this.options.prepayAllowed))
	{		
		this.payRateLimiter = true;
		setTimeout(() => { this.payRateLimiter = false; }, this.options.payRateLimDelay);
		
		let amount = Math.ceil(this.options.payAmountSec * pps);
		
		console.log("Requesting payment for " + this.info.title + ', amount: '  + amount +  ' ...');
		
		if(amount > 0)
		{
			let retval = this.requestPayment(amount, this.streamId);
			if(retval === true)
				this.paymentRequested = true;
		}
		else
		{	
			this.paymentFinished('FREE_ITEM_DUMMY_PAY_ID');
		}
	}
}

// Set function that is called when stream is stopped
// onstopfunc()
Streamer.prototype.setOnStopFunction = function(onstopfunc)
{
	this.onStop.push(onstopfunc);
}

// Sets state to STATE.STOP and executes onStop() function
Streamer.prototype.setStateStop = function()
{
	this.state = STATE.STOP;
	try{
		this.onStop.forEach(sf => {	sf(); });
		this.onStop = [];
	}catch(e){
		console.error("Error when executing onStop():" + e);
	}
}

// Init Streamer by downloading first slice and data
Streamer.prototype.init = function(startBuffering = false, manresolve = false, manreject = false)
{
	return new Promise((resolve, reject) => { 
		try
		{
			if(manresolve !== false && manreject !== false)
			{
				resolve('USING_MANUALPROMISE');
				resolve = manresolve;
				reject = manreject;
			}
			
			if(this.paymentRequested == true)
			{
				this.onPaymentFinished.push(() => { this.init(startBuffering, resolve, reject); });
				return;
			}
			
			
			let initFinished = () => {
									
				if(startBuffering)
				{
					this.manageBuffers().then(() => {
						this.state = this.state < 1 ? STATE.STOP : this.state;
						console.log("Init successs");
						resolve('Init Success.');
						try{
							this.oninitsuccess();
						}catch(e){
							console.error(e);
						}
					}).catch((e)=>{
						reject(e);
					});
				}
				else
				{
					this.state = this.state < 1 ? STATE.STOP : this.state;
					console.log("Init successful.");
					resolve('Init Success.');
					try{
						this.oninitsuccess();
					}catch(e){
						console.error(e);
					}
				}	
			};
			
			
			if(typeof this.sliceBuffers[0] !== 'undefined')	// Seems to be already initialized
			{
				initFinished();
				return;
			}
			
			this.server.getSlice(this.id, startBuffering ? 0 : -1, 
					this.payID.length > 0 ? this.payID[0] : '').then(r => 
			{
				this.info = r.info;
				this.rosi = r.rosi;
				this.slice = r.slice;
				this.payIDBalance[this.payID[0]] = r.rosi.remaining;
				
				this.addToAudioBuffer(r.audioData, r.slice.number).then(() => {
					
					initFinished();
				});	
				
			}).catch(e => 
			{
				if(e == "Rosi-PaymentFailed")
				{
					this.payID.shift();
					
					if(this.payID.length > 0)
					{
						console.warn("Removed current payID, retrying with other ...");
						this.init(startBuffering,resolve,reject); 
					}
					else
					{
						console.warn("Removed current payID and requesting payment, then retrying.");
						this.onPaymentFinished.push(()=>{ 
								this.init(startBuffering,resolve,reject); 
						});
						this.checkRequestPayment();
					}
					
					return;
				}
				
				console.error("Error requesting slice:", e);
				reject(e);
			});
		}catch(e)
		{
			reject(e);
			return;
		}
	});	
};

// Add freshly received slice of audio data to buffer
Streamer.prototype.addToAudioBuffer = function(audioData, sliceNo)
{
	return new Promise((resolve, reject) => {
		try
		{
			if(sliceNo >= 0)
			{
				this.audioCtx.decodeAudioData(audioData, (buffer) => {
			   
					this.sliceBuffers[sliceNo] = buffer;
					
					resolve();
				});
			}
			else
			{
				resolve();	// nothing to do, just continue for (empty) init object
			}
		}catch(e)
		{
			console.log("Error occurred adding data to Audio buffer:" + e);
			reject(e);
			return;
		};
	});
};


// Prepares buffer with usable length
Streamer.prototype.getBuffer = function(number, tOffset = 0)
{
	if(typeof this.sliceBuffers[number] === 'undefined')
	{
		console.error("Requested Slice has not been downloaded yet for", this.info.title);
		this.state = STATE.FINISHING;
		this.onPaymentFinished.push(() => { this.play(SPECIALTIME.RESUME); });
		console.warn("Set state to FINISHING because requested slice has not been downloaded yet.");
		console.log("Playback is scheduled to resume when next payment is finished.");
		return false;
	}
	// Return full buffer if no offset is given
	if(tOffset == 0)
		return this.sliceBuffers[number];

	// Get sliced buffer...
	let buffer = this.sliceBuffers[number];
	let sOffset = Math.floor(tOffset * buffer.sampleRate);
	
	if((buffer.length - sOffset) <= 0)
	{
		return buffer;		// Invalid offset provided, return full buffer
	}

	let bufferSliced = this.audioCtx.createBuffer(	buffer.numberOfChannels, 
													buffer.length - sOffset, 
													buffer.sampleRate	);
							
	let tmpArray = new Float32Array(buffer.length - sOffset);
	
	// Copy relevant samples to new buffer
	for (let i = 0; i < buffer.numberOfChannels; i++) {
      buffer.copyFromChannel(tmpArray, i, sOffset);
      bufferSliced.copyToChannel(tmpArray, i, 0);
    }
    
    return bufferSliced;
};


// Exchange current for next element
Streamer.prototype.exchangeSource = function(ended)
{
	if(this.state != STATE.PLAY && this.state != STATE.FINISHING)
		return;		// Do nothing for stopped slices
			
	if(ended === this.current)		// Check if ended stream element is current
	{
		if(this.current.number + 1 >= this.slice.length || 
			(this.state == STATE.FINISHING && this.next.startTime + this.next.duration 
				< this.audioCtx.currentTime))	// last element played
		{
			this.setStateStop();
			return;
		}
		
		if(this.current.number + 1 == this.next.number)
		{
			// Exchange current for next
			this.current = this.next;
			this.next = {};
			
			// Prepare next slice
			if(this.current.number < this.slice.length - 1)
				this.prepareSlice(	this.next, 
									this.getBuffer(this.current.number + 1),
									this.current.startTime + this.current.source.buffer.duration,
									this.current.number + 1 ); 
		}
		else
		{
			console.error("No/wrong slice preloaded for", this.info.title);
		}
	}
	else if(ended === this.next && this.state == STATE.FINISHING)
	{
		this.setStateStop();
	}
	else
	{
		console.warn("Unknown Source (not 'current') ended playing.");
	}
}


// Starts slice playback
Streamer.prototype.prepareSlice = function(dest, buffer, startTime, number)
{
	if(buffer == false)		// Buffer has not been downloaded ... 
		return;
		
	dest.buffer = buffer;
	dest.number = number;
	dest.source = this.audioCtx.createBufferSource();
	
	dest.source.buffer = dest.buffer;
	dest.source.connect(this.gainNode);
	
	dest.startTime = startTime;
	dest.duration = dest.source.buffer.duration;
	dest.source.start(dest.startTime);
	
	dest.source.onended = (e) => { this.exchangeSource(dest); };
};



// Check if download of new slice is needed, and start requests
Streamer.prototype.manageBuffers = function(noInit = false, playRequest = false, 
													manresolve = false, manreject = false)
{
	if(!noInit && this.manageBuffersInterval === false)	// Interval not initialized yet
		this.manageBuffersInterval = setInterval(() => { 
				if(this.payID.length > 0)
					this.manageBuffers().catch(e=>{});	// Ignore errors for periodic updates
				else
					console.log('Will not manage Buffers until payID is set.');
					this.checkRequestPayment();
			}, 
			this.options.manageBuffersIntervalTime );

	return new Promise((resolve, reject) => {
		
		if(manresolve !== false && manreject !== false)
		{
			resolve('USING_MANUALPROMISE');
			resolve = manresolve;
			reject = manreject;
		}

		if(this.requested > 0)
		{
			console.warn('Last manager did not finish yet. Requested:', this.requested);
			if(typeof this.errorCounter.dnf == 'undefined')
				this.errorCounter.dnf = 1;
			else
				this.errorCounter.dnf ++;
			if(this.errorCounter.dnf > 5 * this.requested)
				this.requested = 0;
			reject('OLD_DNF');
			return;
		}
		
		this.errorCounter.dnf = 0;
	
		try
		{
			if(this.state == STATE.PLAY || (this.state == STATE.STOP && 
					(this.successfulPayments > 0 || playRequest)))
			{
				this.requested = 0;
				// Check what slices are needed ...
				for(	let i = this.current.number; 
						i < this.current.number + this.options.prebuffer && i < this.slice.length; 
						i ++ )
				{
					if(typeof this.sliceBuffers[i] === 'undefined')
					{
						this.server.getSlice(this.id, i, 
								this.payID.length > 0 ? this.payID[0] : '').then(r => 	
						{
							// Update stream info
							this.rosi = r.rosi;
							this.payIDBalance[this.payID[0]] = r.rosi.remaining;
							this.checkRequestPayment();
							
							// Add stream data
							this.addToAudioBuffer(r.audioData, r.slice.number).then(()=>{
								this.requested --;
								if(this.requested <= 0)
								{									
								  // Finished managing
								  resolve();
								}
								return;
							});
						}).catch(e => 
						{
							if(e == "Rosi-PaymentFailed")
							{
								this.payID.shift();
					
								if(this.payID.length > 0)
								{
									console.warn("Removed current payID, retrying with other ...");
									this.manageBuffers(noInit, playRequest, resolve, reject);
								}
								else
								{
									console.warn("Removed current payID and requesting " + 
										" payment, then retrying.");
									this.onPaymentFinished.push(()=>{ 
											this.manageBuffers(noInit, playRequest, resolve, reject); 
									});
									this.checkRequestPayment();
								}
							}
							else
								console.error("Error requesting slice:", e);
								
							this.requested = 0;
							reject(e);
						});
						
						this.requested ++;
					}
				}

				if(this.requested === 0)
					resolve();
					return;
			}
			else
			{
				console.warn("Requesting prepayment.");
				this.checkRequestPayment(true);
				this.onPaymentFinished.push(()=>{ 
					this.manageBuffers(noInit, playRequest, resolve, reject); 
				});
				return;
			}
		}catch(e)
		{
			console.log("Error occurred when managing Buffers: " + e);
			this.requested = 0;
			reject();
			return;
		}
	});
};


// Start playing stream
// set startTime to SPECIALTIME.RESUME to resumed previously stopped audio
Streamer.prototype.play = function(startTime = 0, manresolve = false, manreject = false)
{
	let sliceNo;
	
	this.options.prepayAllowed = true;
			
	if(this.state == STATE.PLAY  || this.state == STATE.FINISHING)
	{
		console.log('Stream already playing ... ');
		this.stop(true);
	}
		
	return new Promise((resolve, reject) => {
	
		if(manresolve !== false && manreject !== false)
		{
			resolve('USING_MANUALPROMISE');
			resolve = manresolve;
			reject = manreject;
		}
		
		if(this.state == STATE.UINIT)
		{
			console.warn('Streamer not yet initialized, will play as init is finished.');
			this.oninitsuccess = () => { this.play(startTime, resolve, reject); };
			return;
		}
		
		if(startTime == SPECIALTIME.RESUME)
		{
			sliceNo = this.current.number;
			startTime = this.current.startTime;
			if(this.nextStartTime > 0)
			{
				startTime = this.nextStartTime;
				this.nextStartTime = 0;
			}
			console.log('Resuming on number ' + sliceNo + ', time ' + startTime);
		}
		else
		{
			sliceNo = Math.floor(startTime / this.slice.duration);
			startTime -= sliceNo * this.slice.duration;
			this.current.number = sliceNo;
		}
	
		if(startTime < 0 || sliceNo < 0 || sliceNo >= this.slice.length){
			console.error('Invalid startTime provided, playing from beginning.');
			sliceNo = 0;
			startTime = 0;
		}
		
		console.log('Just making sure buffers are ready...');
		this.manageBuffers(false, true).then(() => {
			console.log('Now preparing buffers...');
			this.prepareSlice(	this.current, 
								this.getBuffer(sliceNo, startTime), 
								this.audioCtx.currentTime + 0.1,
								sliceNo);
					
			// Prepare next slice
			if(this.current.number < this.slice.length - 1)
				this.prepareSlice(	this.next, 
									this.getBuffer(this.current.number + 1),
									this.current.startTime + this.current.source.buffer.duration,
									this.current.number + 1 ); 
			
			this.state = STATE.PLAY;
			resolve(this.state);
			
		}).catch(e => {
						
			if(e == "Rosi-PaymentFailed")
			{
				console.log('Rosi-Payment Failed. Trying again after next payment...');
				this.onPaymentFinished.push(() => { this.play(startTime, resolve, reject); });
				return;
			}
			else if(e == "OLD_DNF")
			{
				console.log('Earlier buffer-manager did not finish yet. Trying again in 1 sec...');
				setTimeout(() => { this.play(startTime, resolve, reject); }, 1000 );
			}
			else
			{
				console.error('Error ocurred when buffering stream: ' + e);
				reject("Unhandled: " + e);
			}
		});
	});
};

// if now is false, already downloaded and prepared slices will be played until end
Streamer.prototype.stop = function(now = true)
{
	this.state = STATE.FINISHING;
	
	if(!now)
		return;
	
	this.state = STATE.STOP;		// setStateStop() is called after everything is stopped
	
	try
	{
		this.current.source.stop();
		this.next.source.stop();
		
		this.current.source.onended = () => {};
		this.next.source.onended = () => {};

		// set startTime to stop value to be able to resume
		this.current.startTime = this.audioCtx.currentTime - this.current.startTime + 
									(this.slice.duration - this.current.duration);	
									
		this.setStateStop();		// here everything is officially stopped
	}catch(e){};	// OK to fail when sources have not been initialized
};


// Static helper function to calculate human readable time from seconds timestamp
Streamer.posToPosHuman = function(time)
{
	let pos_human = {h:0, m:0, s:0, ms:0, string: ""};
	
	pos_human.h = parseInt(time / 3600, 10);
	time -= pos_human.h * 3600;
	pos_human.m = parseInt(time / 60, 10);
	time -= pos_human.m * 60;
	pos_human.s = parseInt(time, 10);
	time -= pos_human.s;
	pos_human.ms = parseInt(time * 1000, 10);
	
	pos_human.string = ((pos_human.h > 0) ? (('00' + pos_human.h).slice(-2) + ':'): "") + 
							('00' + pos_human.m).slice(-2) + ':' + ('00' + pos_human.s).slice(-2)
	
	return pos_human;
};


// Get current status object of stream
Streamer.prototype.getInfo = function()
{
	let info = {
		state : this.state,					// State code as defined in STATE object
		duration : 0,						// Duration of complete stream in seconds
		pos : 0,							// Position in seconds (float)
		pos_human : {h:0, m:0, s:0, ms:0},	// Position in hours, min., sec., millisec.
		pos_pc : 0,							// Position in percent of stream length
		ppm : 0,							// Price per minute of stream in iota
		volume : this.gainNode.gain.value	// Currently set gain/volume value
	};
	
	try
	{
		if(this.state == STATE.PLAY || this.state == STATE.FINISHING)
		{
			info.pos = (this.current.number + 1) * this.slice.duration - this.current.duration +
							this.audioCtx.currentTime - this.current.startTime;
		}
		else if(this.state == STATE.STOP)
		{
			info.pos = this.current.number * this.slice.duration + this.current.startTime;
		}
		
		if(this.state == STATE.PLAY || this.state == STATE.STOP)
		{
			info.duration = this.info.duration;
			info.ppm = this.rosi.price * 60 / this.slice.duration;	
			
			info.pos = info.pos > 0 ? info.pos : 0.0;
			info.pos = info.pos < info.duration ? info.pos : info.duration;
			info.pos_pc = info.pos * 100 / info.duration;
			
			info.pos_human = Streamer.posToPosHuman(info.pos);
		}
	}catch(e){
		info.state = STATE.GENERR;
		info.error = e;
	}
	
	return info;
};

// Set volume level, default valume value is 1.0; 0.0 means muted
// delay in seconds (float) from calling this function
Streamer.prototype.setVolume = function(volume, delay = 0)
{
	this.gainNode.gain.setValueAtTime(volume, this.audioCtx.currentTime + delay);
}


