/*
 * 
 * 		AUDIO Streaming Service Client
 * 			   Audio Playback
 * 
 * 			Playlist User Interface 
 * 
 * 	ROSI - Realtime Online Payment with IOTA
 * 
 * 		   Proof of Concept / Example
 * 
 * 
 * 	Changed 20.03.2020
 * 
 * */
 
 
let player = new Player();
let paused = false;

//		--- MAIN Player ---

let timeslide_dragging = false;
const TIMESLIDE_REFRESH_MS = 100;

// Play/Pause button on main player
async function upl_play_pause()
{
	document.getElementById("playPause").classList.remove("stop");
	document.getElementById("playPause").classList.remove("play");
	document.getElementById("playPause").classList.add("waiting");
	
	if(player.state == STATE.PLAY) 		// Pause playback
	{
        // Stop Stream
        paused = true;
        let i = player.current();
        try
        {
			document.getElementById("mainlistitem_" + i.provider + "_" + i.id).classList.add("paused");
		}catch(e){};	// ignore if element is not on current page
		await player.stop();
	}
	else if(player.playlist.length > 0)	// Start playback / resume if playlist is not empty
	{
		// Start Stream
		await player.play(paused ? SPECIALTIME.RESUME : 0);
	}
	else
	{
		document.getElementById("playPause").classList.remove("waiting");
		document.getElementById("playPause").classList.add("play");
		alert("Playlist is empty!");
	}
}

// Time slider
// Update slider function
setInterval(() => {
	
	if(typeof document.getElementById("timeSlider") == "undefined")
		return;		// Site has not been fully loaded

	// Update slider
	if(player.state == STATE.PLAY || player.state == STATE.STOP) 
	{
		let info = player.getInfo();
				
		if (!timeslide_dragging) 
		{
			document.getElementById("timeSlider").value = info.pos_pc;
			setTimeCode(info.pos, info.duration);
		}
	} 
	else
	{
		document.getElementById("timeSlider").value = 0;
		setTimeCode(0, 0);
	}
	
}, TIMESLIDE_REFRESH_MS);


function upl_updateButtons()
{
	Array.from(document.getElementsByClassName("mainlistitem")).forEach(element => {
		element.parentElement.classList.remove("titleRowPlaying");
		element.classList.remove("stop");
		element.classList.remove("waiting");
		element.classList.add("play");
	});

	// Set Stop symbol for current
	try{
		let info = player.current();
		if(info.state == STATE.PLAY || info.state == STATE.STOP)
		{
			let currEl = document.getElementById("mainlistitem_" + info.provider + "_" + info.id);
			currEl.parentElement.classList.add("titleRowPlaying");
			if(info.state == STATE.PLAY)
			{
				currEl.classList.remove("play");
				currEl.classList.add("stop");
			}
			else if(info.state == STATE.STOP && player.playRequested)
			{
				currEl.classList.remove("play");
				currEl.classList.add("waiting");
			}
		}
	}catch(e){};
	
	// Update main player button
	if(player.state == STATE.PLAY)
	{
		// Set Button to pause
		document.getElementById("playPause").classList.remove("play");
		document.getElementById("playPause").classList.remove("waiting");
		document.getElementById("playPause").classList.add("pause");
	}
	else if(player.state == STATE.STOP && player.playRequested)
	{
		// Set Button to waiting
        document.getElementById("playPause").classList.remove("pause");
        document.getElementById("playPause").classList.remove("play");
        document.getElementById("playPause").classList.add("waiting");
	}
	else if(player.state != STATE.PLAY)
	{
		// Set Button to play
        document.getElementById("playPause").classList.remove("pause");
        document.getElementById("playPause").classList.remove("waiting");
        document.getElementById("playPause").classList.add("play");
	}	
}


function timeslide_drag(pos) 
{
	timeslide_dragging = true;
	
    if (player.state == STATE.PLAY || player.state == STATE.STOP) 
    {
		let duration = player.getInfo().duration;
        setTimeCode(pos * duration / 100.0, duration);
    } 
    else 
    {
        document.getElementById("timeSlider").value = 0;
        setTimeCode(0, 0);
    }
}

function timeslide_drop(pos) 
{
	timeslide_dragging = false;
	let duration = player.getInfo().duration;
	let pos_sec = pos * duration / 100.0;
	
    if (player.state == STATE.PLAY) 
    {
		setTimeCode(pos_sec, duration);
        player.play(pos_sec);
    } 
    else if(player.state == STATE.STOP && player.setNextStartTime(pos_sec) == 0)
    {
		setTimeCode(pos_sec, duration);
	}
	else
	{
		document.getElementById("timeSlider").value = 0;
		setTimeCode(0, duration)
	}
}

function setTimeCode(pos_sec, duration) 
{
    document.getElementById("timeCode").innerText = Player.posToPosHuman(pos_sec).string;
    document.getElementById("timeRemaining").innerText = 
										Player.posToPosHuman(duration - pos_sec).string;
}


//		---		Playlist element 	 ---

// Toggle display Playlist 
function upl_showHide() 
{
    if (document.getElementById("playList").classList.contains("playListHidden")) 
    {
        document.getElementById("playList").classList.remove("playListHidden");
        document.getElementById("playList").classList.add("playListShown");

        document.getElementById("titleListHead").classList.remove("titleListFull");
        document.getElementById("titleListHead").classList.add("titleListReduced");
        document.getElementById("titleList").classList.remove("titleListFull");
        document.getElementById("titleList").classList.add("titleListReduced");

        document.getElementById("playListButton").classList.remove("playListIcon");
        document.getElementById("playListButton").classList.add("close");
    }
    else 
    {
        document.getElementById("playList").classList.add("playListHidden");
        document.getElementById("playList").classList.remove("playListShown");

        document.getElementById("titleListHead").classList.remove("titleListReduced");
        document.getElementById("titleListHead").classList.add("titleListFull");
        document.getElementById("titleList").classList.remove("titleListReduced");
        document.getElementById("titleList").classList.add("titleListFull");

        document.getElementById("playListButton").classList.add("playListIcon");
        document.getElementById("playListButton").classList.remove("close");
    }
}


// Adds Item on bottom of Playlist
function upl_addItem(info, inx) 
{
	let li = document.createElement('li');
	li.id = inx;
	li.classList.add('draggable');
	li.classList.add('pl_stateclass_' + (info.state >= 0 ?  info.state :
												( "n" + (-1 * info.state))));
	li.addEventListener("dblclick", async function(e){
		e.preventDefault();
		e.stopPropagation();
		await player.play(0, inx); 
	});
	
	let attr = document.createAttribute('draggable');
	attr.value = 'true';

	let title = document.createElement("SPAN");
	title.classList.add("plTitle", "plText");
	title.innerText = info.title;
	
	let artist = document.createElement("SPAN");
	artist.classList.add("plArtist", "plText");
	artist.innerText = info.artist;
		
	let duration = document.createElement("SPAN");
	duration.classList.add("plDuration", "plText");
	duration.innerText = Player.posToPosHuman(info.duration).string;
	
	let btnDelete = document.createElement("SPAN");
	btnDelete.classList.add("plDelete", "plText");
	btnDelete.onclick = (e) => {
		e.preventDefault();
		e.stopPropagation();
		player.removeFromPlaylist(inx);
	}
	btnDelete.addEventListener("dblclick", (e) => {
		e.preventDefault();
		e.stopPropagation();
	});
	
	li.setAttributeNode(attr);
	li.appendChild(title);
	li.appendChild(artist);
	li.appendChild(duration);
	li.appendChild(btnDelete);
	
	// li.appendChild(document.createTextNode(info.title));
	
	document.getElementById('playlist_list').appendChild(li);
	addEventsDragAndDrop(li);
}

// Update playlist to show listInfo
function upl_updatePlaylist()
{
	document.getElementById('playlist_list').innerHTML = "";
	
	let current = player.current({	title: " - - - -", 
									coverUrl: "/img_lossy/images/cover_default.jpg"
								});
								
	document.getElementById("currentPlayingInfo").innerText = current.title + 
		" - " + current.album + " - " + current.artist + " - " + printIota(current.ppm) + "/min" + 
		((current.comment.length > 0) ? ("\n" + current.comment) : "");
	document.getElementById('playerCover').src = current.coverUrl;
	player.getPlaylist().forEach(upl_addItem);
}


// Drag - Drop functions

function dragStart(e) 
{
    this.style.opacity = '0.4';
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('oldinx', this.id);
}

function dragEnter(e) 
{
    this.classList.add('over');
}

function dragLeave(e) 
{
    e.stopPropagation();
    this.classList.remove('over');
}

function dragOver(e) 
{
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    return false;
}

function dragDrop(e) 
{
	let oldinx = Number(e.dataTransfer.getData('oldinx'));
	let newinx = Number(this.id);
	
    if (oldinx != newinx) 
    {
		player.movePlaylistPosition(oldinx, newinx);
    }
    return false;
}

function dragEnd(e) 
{
    var listItems = document.querySelectorAll('.draggable');
    listItems.forEach(item => {
        item.classList.remove('over');
    });
    this.style.opacity = '1';
}

function addEventsDragAndDrop(el) 
{
    el.addEventListener('dragstart', dragStart, false);
    el.addEventListener('dragenter', dragEnter, false);
    el.addEventListener('dragover', dragOver, false);
    el.addEventListener('dragleave', dragLeave, false);
    el.addEventListener('drop', dragDrop, false);
    el.addEventListener('dragend', dragEnd, false);
}


let drawSwitch = function(el, on)
{
	// let outer = document.getElementById('swKeepPlayed');
	let slider = el.children[0];
	
	if(on)
	{
		slider.classList.add("sliderSwOn");
		slider.classList.remove("sliderSwOff");
		el.classList.add("swOuterOn");
		el.classList.remove("swOuterOff");
	}
	else
	{
		slider.classList.add("sliderSwOff");
		slider.classList.remove("sliderSwOn");
		el.classList.add("swOuterOff");
		el.classList.remove("swOuterOn");
	}
}

let drawBtnRepeat = function(repeatVar)
{
	let el = document.getElementById('btnRepeat');
	
	el.classList.remove("repeatOff", "repeatAll", "repeatSingle");
	switch(repeatVar)
	{
		case 1:
			el.classList.add("repeatAll");
			break;
			
		case 2: 
			el.classList.add("repeatSingle");
			break;
		
		case 0:
		default:
			el.classList.add("repeatOff");
			break;
	}
}


//////////////////////////////////////////////////////////////////////
//// 		INITIALIZATION  

player.onPlaylistUpdate = () => { setTimeout(() => { upl_updatePlaylist(); }, 75); 
												};
												
player.onStateChange = () => { setTimeout(() => { 	upl_updateButtons(); 
													upl_updatePlaylist(); 
												}, 50); };


document.getElementById('swKeepPlayed').onclick = () => {
	player.options.keep_played_title = !player.options.keep_played_title;
	drawSwitch(document.getElementById('swKeepPlayed'), player.options.keep_played_title);
};

drawSwitch(document.getElementById('swKeepPlayed'), player.options.keep_played_title);


document.getElementById('btnRepeat').onclick = () => {
	player.options.repeat ++;
	if(player.options.repeat > 2)
		player.options.repeat = 0;	
	
	drawBtnRepeat(player.options.repeat);
};

drawBtnRepeat(player.options.repeat);







