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
 

let providers = [
		{
			provider_human: "ROSI POC1 'Potato Server'", 
			provider: "rosipoc01",
			srv_stream: "http://poc.rosipay.net:10010", 
			srv_pay: "http://poc.rosipay.net:9000",
			active: true,
			srv_stream_comm: {}
		}
	];


let loadedTitleList = [];
let issorted = false;

let connectToServers = function()
{
	providers.forEach(p => {
		if(p.active)
		{
			p.srv_stream_comm = new ServerComm(p.srv_stream);
		}
	});
}


// list: element to add the item to
// info: standard track info object
// provider: rosi provider 
let addTitleToList = function(list, info, provider, inx)
{	
	if(provider === false)
		provider = providers.filter(p => p.provider == info.provider)[0];
		
	let tmpDiv = document.createElement("DIV");
	tmpDiv.classList.add("titleRow");
	tmpDiv.classList.add(inx % 2 == 0 ? "even" : "odd");

	let buttonId = "mainlistitem_" + provider.provider + "_" + info.id;
	
	let btnPlay = document.createElement("SPAN");
	btnPlay.id = buttonId;
	btnPlay.classList.add("rowIcon", "left", "play", "mainlistitem");
	btnPlay.onclick = (e) => { titlePlayPause(provider.srv_stream, provider.srv_pay, info.id, e); };

	let btnAddToPlaylist = document.createElement("SPAN");
	btnAddToPlaylist.id = buttonId;
	btnAddToPlaylist.classList.add("rowIcon", "right", "addToList", "addlist_mainlistitem");
	btnAddToPlaylist.onclick = (e) => { player.addToPlaylist(provider.srv_stream, provider.srv_pay, info.id); };
	
	let track = document.createElement("SPAN");
	track.classList.add("tlTrack", "rowText", "tlElement");
	track.innerText = String(info.track);
	
	let title = document.createElement("SPAN");
	title.classList.add("tlTitle", "rowText", "tlElement");
	title.innerText = info.title;
	
	let album = document.createElement("SPAN");
	album.classList.add("tlAlbum", "rowText", "tlElement");
	album.innerText = info.album;
	
	let artist = document.createElement("SPAN");
	artist.classList.add("tlArtist", "rowText", "tlElement");
	artist.innerText = info.artist;
	
	let duration = document.createElement("SPAN");
	duration.classList.add("tlDuration", "rowText", "tlElement");
	duration.innerText = Player.posToPosHuman(info.duration).string;
	
	let price = document.createElement("SPAN");
	price.classList.add("tlPrice", "rowText", "tlElement");
	price.innerText = printIota(info.ppm) + "/min";
	
	// Construct line out of the created items ... 	
	tmpDiv.appendChild(btnPlay);
	tmpDiv.appendChild(track);
	tmpDiv.appendChild(title);
	tmpDiv.appendChild(album);
	tmpDiv.appendChild(artist);
	tmpDiv.appendChild(duration);
	tmpDiv.appendChild(price);
	tmpDiv.appendChild(btnAddToPlaylist);
	
	list.appendChild(tmpDiv);
}


// Adds elmenet with cover picture, for album display
let addAlbumTileToElement = function(element, info, provider)
{
	let outerDiv = document.createElement("DIV");
	outerDiv.classList.add("albumTile");
	
	let cover = document.createElement("IMG");
	cover.classList.add("albumTileCover");
	cover.src = info.cover;
	
	let text = document.createElement("DIV");
	text.classList.add("albumTileText");
	text.innerText = info.artist + "\n" + info.album;
	
	let btnPlayAlbum = document.createElement("SPAN");
	btnPlayAlbum.classList.add("play", "albumTileStart");
	
	let btnAddAlbum = document.createElement("SPAN");
	btnAddAlbum.classList.add("addToList", "albumTileAdd");
	
	outerDiv.onclick = (e) => {	
			e.preventDefault(); 
			showAlbumTitles(provider, info.albumID); 
	};
	
	btnPlayAlbum.onclick = (e) => { 
			e.preventDefault();
			e.stopPropagation();   
			addAlbumToPlaylist(provider, info.albumID, true);  
	};
	
	btnAddAlbum.onclick = (e) => { 
			e.preventDefault();
			e.stopPropagation();   
			addAlbumToPlaylist(provider, info.albumID, false);  
	};
	
	outerDiv.appendChild(cover);
	outerDiv.appendChild(text);
	outerDiv.appendChild(btnPlayAlbum);
	outerDiv.appendChild(btnAddAlbum);
	element.appendChild(outerDiv);
}


let titlePlayPause = function(srv_stream, srv_pay, id, e)
{
	let _self = e.target;
	
	if(_self.classList.contains("paused"))
	{
		_self.classList.remove("paused");
		upl_play_pause();
	}
	else if(_self.classList.contains("play"))
	{
		_self.classList.add("waiting");
		document.getElementById("playPause").classList.add("waiting");
		player.addPlayInstant(srv_stream, srv_pay, id, 0);
	}
	else
	{
		_self.classList.add("paused");
		upl_play_pause();
	}
}

let handleServerConnectionError = function(e)
{
	console.error("Error occurred when trying to get data:" + e);
}


let showSortTitleList = function(provider, sort = "none", invert = false)
{
	if(!invert || issorted != (sort + "_normal"))
		invert = false;
	
	console.log("invert:", invert);
	
	issorted = sort + (invert ? "_invert" : "_normal");
	
	loadedTitleList.sort((first, second) => {
		
		if(invert)
		{
			let tmp = first;
			first = second;
			second = tmp;
		}
		
		if(sort == "track" || sort == "duration" || sort == "ppm")
			return first[sort] - second[sort];
		if(sort == "title" || sort == "album" || sort == "artist")
		{
			let str1 = first[sort].toUpperCase();
			let str2 = second[sort].toUpperCase();
			return (str1 < str2) ? -1 : ((str1 > str2) ? 1 : 0);
		}
		return 0;
		
	}).forEach((t, inx) => {
		let list = document.getElementById("titleList");
		addTitleToList(list, t, provider, inx);
	});
}


let showTitles = function(options = {}, sort = "none")
{
	document.getElementById('browser_title').innerText = "Titles";
	document.getElementById("titleList").innerHTML = "";
	document.getElementById("browser_subtitle").innerText = "";
	document.getElementById("titleListHead").style.opacity = 1;
	document.getElementById("bottominfo1").innerText = "";
	document.getElementById("bottominfo2").innerText = "";
	
	providers.forEach(p => {
		p.srv_stream_comm.getAvailableList(options).then(titles => {
			
			loadedTitleList = titles;
			showSortTitleList(p, sort);
			
		}).catch(handleServerConnectionError);
	});
	
	setTimeout(upl_updateButtons, 100);
}

let showAlbums = function(searchString = "")
{
	document.getElementById('browser_title').innerText = "Albums";
	document.getElementById("titleList").innerHTML = "";
	document.getElementById("browser_subtitle").innerText = "";
	document.getElementById("titleListHead").style.opacity = 0;
	document.getElementById("bottominfo1").innerText = "";
	document.getElementById("bottominfo2").innerText = "";
	
	providers.forEach(p => {
		p.srv_stream_comm.getAvailableAlbums(searchString).then(albums => {
			
			albums.map(a => { return {...a, cover: p.srv_stream + a.cover }}).forEach((a) => {
				let list = document.getElementById("titleList");
				addAlbumTileToElement(list, a, p);
			});
		}).catch(handleServerConnectionError);
	});
};


let showAlbumTitles = function(provider, albumID, sort = "track")
{
	document.getElementById('browser_title').innerText = "Loading Titles ... ";
	document.getElementById("titleList").innerHTML = "";
	document.getElementById("browser_subtitle").innerText = "";
	document.getElementById("titleListHead").style.opacity =  1;
	document.getElementById("bottominfo1").innerText = "";
	document.getElementById("bottominfo2").innerText = "";
	
	provider.srv_stream_comm.getAlbumTitles(albumID).then(titles => {
		
		loadedTitleList = titles;
		showSortTitleList(provider, sort);
		
		document.getElementById('browser_title').innerText = titles[0].album;
		document.getElementById("browser_subtitle").innerText = titles[0].album_artist;
		document.getElementById("bottominfo1").innerText = "AlbumID:";
		document.getElementById("bottominfo2").innerText = titles[0].albumID;
		
	}).catch(handleServerConnectionError);

	setTimeout(upl_updateButtons, 100);
}


async function addAlbumToPlayer(provider, titles, play)
{
	let startInx = player.getPlaylist().length;
	
	await player.stop();
	
	for(let i = 0; i < titles.length; i++)
	{
		await player.addToPlaylist(provider.srv_stream, provider.srv_pay, titles[i].id, false);
	}
	
	if(play)
		await player.play(0, startInx);
	else
		await player.initNextStreams();
		
	setTimeout(upl_updateButtons, 100);
}

let addAlbumToPlaylist = function(provider, albumID, play)
{
	provider.srv_stream_comm.getAlbumTitles(albumID).then(titles => {
	
		addAlbumToPlayer(provider, titles, play);
		
	}).catch(handleServerConnectionError);
}


let addProviderToMenu = function(provider)
{
	let entry = document.createElement("DIV");
	entry.classList.add("spmEntry");
	
	let elements = [];
	let texts = ["Name:", "ID:", "Stream - Server URL:", "ROSI - Server URL:", "Use This Provider:"];
	let values = [provider.provider_human, provider.provider, provider.srv_stream, provider.srv_pay];
	for(let i = 0; i < 4; i++)
	{
		let txtEl = document.createElement("SPAN");
		txtEl.classList.add("spmEntryText");
		txtEl.innerText = texts.shift();
		
		let inpEl = document.createElement("INPUT");
		inpEl.type = "text";
		inpEl.classList.add("spmEntryInput");
		inpEl.value = values.shift();
		
		entry.appendChild(txtEl);
		entry.appendChild(inpEl);
		entry.appendChild(document.createElement("BR"));
	}
	
	let txtEl = document.createElement("SPAN");
	txtEl.classList.add("spmEntryText");
	txtEl.innerText = texts.shift();
	
	let chkEl = document.createElement("INPUT");
	chkEl.type = "checkbox";
	chkEl.checked = provider.active;
	
	entry.appendChild(txtEl);
	entry.appendChild(chkEl);
	entry.appendChild(document.createElement("BR"));
	
	document.getElementById('spmMenuEntries').appendChild(entry);
}

let saveProviderSetup = function(provider)
{
	let entries = [ ...document.getElementById('spmMenuEntries').children];
	
	let providers_new = [];
	entries.forEach(np => {
		let p = {};
		p.provider_human = np.children[1].value;
		p.provider = np.children[4].value;
		p.srv_stream = np.children[7].value;
		p.srv_pay = np.children[10].value;
		p.active = np.children[13].checked;
		
		if(p.provider_human.length > 0 && p.provider.length > 0 && 
			p.srv_stream.length > 0 && p.srv_pay.length > 0 && typeof p.active == "boolean")
		{
			p.srv_stream_comm = {};
			providers_new.push(p);
			console.log("Added Provider to List.");
		}
		else
		{
			console.log("Did not save provider entry due do not correctly filled in data.");
		}
	});
	
	providers = providers_new;
	connectToServers();
}


let updateProviderSettingsData = function()
{
	document.getElementById('spmMenuEntries').innerHTML = "";
	providers.forEach(p => {
		addProviderToMenu(p);	
	});
}

let setVolume = function(value)
{
	player.volume(value);
	document.getElementById('currentVolumeText').innerText = String(parseInt(player.volume() * 100)) + " %";
}

///////////////////////////////////////////////
///////////			INIT


document.getElementById('btnShowAlbums').onclick = (e) => { showAlbums(); };
document.getElementById('btnShowTitles').onclick = (e) => {  showTitles(); };

document.getElementById('btnSelectProvider').onclick = (e) => 
{ 
	let menu = document.getElementById('selectProvidersMenu');
	let btn = document.getElementById('btnSelectProvider');
	if(menu.style.display == "")
	{
		menu.style.display = "none";
		btn.style.backgroundColor = "";
		btn.style.color = "";
	}
	else
	{
		updateProviderSettingsData();
		menu.style.display = "";
		btn.style.backgroundColor = "#FFFFFF";
		btn.style.color = "#ff3b30";
	}
};
document.getElementById('selectProvidersMenu').style.display = "none";

document.getElementById('playPause').onclick = upl_play_pause;
document.getElementById('controlPrevious').onclick = (e) => {  player.previous(); };
document.getElementById('controlNext').onclick = (e) => {  player.next(); };

document.getElementById('playListButton').onclick = upl_showHide;

document.getElementById('timeSlider').onchange = (e) => { timeslide_drop(e.target.value); };
document.getElementById('timeSlider').oninput = (e) => { timeslide_drag(e.target.value); };

document.getElementById('volumeSlider').onchange = (e) => { setVolume(e.target.value); };
document.getElementById('volumeSlider').oninput = (e) => { setVolume(e.target.value); };


document.getElementById('tlhTrack').onclick = (e) => {

	document.getElementById("titleList").innerHTML = "";
	showSortTitleList(false, "track", true);
};

document.getElementById('tlhTitle').onclick = (e) => {

	document.getElementById("titleList").innerHTML = "";
	showSortTitleList(false, "title", true);
};

document.getElementById('tlhAlbum').onclick = (e) => {

	document.getElementById("titleList").innerHTML = "";
	showSortTitleList(false, "album", true);
};

document.getElementById('tlhArtist').onclick = (e) => {

	document.getElementById("titleList").innerHTML = "";
	showSortTitleList(false, "artist", true);
};

document.getElementById('tlhDuration').onclick = (e) => {

	document.getElementById("titleList").innerHTML = "";
	showSortTitleList(false, "duration", true);
};

document.getElementById('tlhPrice').onclick = (e) => {

	document.getElementById("titleList").innerHTML = "";
	showSortTitleList(false, "ppm", true);
};

document.getElementById('spmAddProvider').onclick = () => {
	addProviderToMenu({
		provider_human: "", 
		provider: "",
		srv_stream: "", 
		srv_pay: "",
		active: false,	
	});
};

document.getElementById('spmSaveInitProvider').onclick = saveProviderSetup;

document.body.addEventListener("keydown", (e) => { 
	if(e.keyCode == 32) 
	{
		e.preventDefault();
		upl_play_pause();
	}
 });

connectToServers();
showAlbums();

document.getElementById('volumeSlider').value = player.volume();
document.getElementById('currentVolumeText').innerText = String(parseInt(player.volume() * 100)) + " %";



