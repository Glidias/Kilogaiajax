/*
Kilogaiajax - Ajax Gaia-Framework  (requires JQuery and History.js).
A lame attempt at creating a Gaia-Flash framework style xml-powered ajax/php/html site.

What isn't available?
- no page stacking (in HTML context, this isn't much use)
- no asset stacking (for now, just duplicate asset dependencies per page node)
- no indexFirst  (in HTML context, this isn't much use)
- no flow customisation (ie. preload or cross flow options)
- no hijacking flow, but got event hooks.

For public api methods, refer to "this.api = ...." line.
*/
if(!Array.indexOf){
    Array.prototype.indexOf = function(obj){
        for(var i=0; i<this.length; i++){
            if(this[i]==obj){
                return i;
            }
        }
        return -1;
    }
}

if(!Array.sortOn){
    Array.prototype.sortOn = function($key){
        this.sort(
                function(a, b){
                    return (a[$key] > b[$key]) - (a[$key] < b[$key]);
                }
            );
    };
};

(function($){
$.getScript = function(url, callback, cache){
	return $.ajax({
			type: "GET",
			url: url,
			success: callback,
			dataType: "script",
			cache: cache
	});
};
})(jQuery);


var GaiaDebug = this["console"] || { log:function(){}, error:function(){} } ;
function GaiaSignal() {
	
	
	var _subscribers = [];
	var dispatching = false;
	var _indiceCache = [];
	
	function add(handler) {
		_subscribers.push(handler);
	}
	this.add = add;
	
	function cleanup() {
		var sub = [];
		var i = _indiceCache.length;
		while(--i > -1) {
			_subscribers[_indiceCache[i]] = null;
		}
		var len = _subscribers.length;
		for (i=0; i< len; i++) {
			if (_subscribers[i]) sub.push(_subscribers[i]);
		}
		_subscribers = sub;
	}
	
	function remove(handler) {
		var index = _subscribers.indexOf(handler);
		if (index == -1) return;
		if (dispatching) {
			_indiceCache.push(index);
			return;
		}
		_subscribers.splice(index, 1);
	}
	this.remove = remove;
	
	function dispatch() {
		var len = _subscribers.length;
		if (len == 0) return;
		dispatching = true;
		if (arguments.length) {
			for (i=0; i< len; i++) {
				_subscribers[i].apply(null, arguments);
			}
		}
		else {
			for (i=0; i< len; i++) {
				_subscribers[i]();
			}
		}
		dispatching = false;
		if (_indiceCache.length) cleanup();
	}
	this.dispatch = dispatch;
	
	function canDispatch() {
		return _subscribers.length !=0;
	}
	this.canDispatch = canDispatch;
}

var Gaiajax = {};
Gaiajax.api = (function(root) {
	
	var html4 = History.emulated.pushState;
	
	History.isTraditionalAnchor = function(url_or_hash) {  
		return true;
	};
	
	
	var contentWrapperQ = "#contentWrapper";

	var birthTime = new Date().getTime();
	var rootURL = null;
	
	// temporary stacks for collecting stuff
	var _stackAssets = [];
	var _stackIds = [];
	var _stackNodes = [];
	
	var _rootNode = {};
	var _ajaxHash = {};
	
	var _gaiaLinkHash = {};
	
	var _head;
	
	// Our page hashes
	var _pageHash = {};  // Key: href src
	var _pathHash = {};	 // Key: path for swfaddress
	var _assetHash = {};
	var _pageAssets = {};
	var _siteAssets = {};
	var _domCacheHash = {};
	var landingPage;
	
	var _preloadJS;
	
	var _startPage;
	var _considerPreload = function() {
		return true;
	};
	
	var _domCache;
	// states of transiting
	var _ajaxReq =null;
	var _gaiaHrefLinks;
	var _gaiaRelLinks;
	var _isInterrupted = false;
	var _pageTransiting = false;
	var curPage = null;    // String url
	var curPageObj;
	var targetPage = null;	// String url
	var targetPageObj = null;
	var currentContent = null;	
	var toRemoveAssetNodes = null;
	var loadCount  = 0;
	var _isIn = false;
	
	var _loading = false;
	var _siteTitle;
	var _defaultTransitionOutMethod = function(callback, currentContent) {
		currentContent.stop().animate({opacity:0}, {duration:600}).promise().done(callback);
	};
	var _defaultTransitionInMethod = function(callback, currentContent) {
		currentContent.css("opacity", 0);
		currentContent.stop().animate({opacity:1}, {duration:600}).promise().done(callback);
	};
	
	var _onDeeplink =  new GaiaSignal();
	var _onBeforeGoto = new GaiaSignal();
	var _onAfterGoto = new GaiaSignal();
	var _onBeforePreload = new GaiaSignal();
	var _onAfterPreload = new GaiaSignal();
	var _onBeforeTransitionIn = new GaiaSignal();
	var _onAfterTransitionIn = new GaiaSignal();
	var _onBeforeTransitionOut = new GaiaSignal();
	var _onAfterTransitionOut = new GaiaSignal();
	var _onAfterComplete = new GaiaSignal();
	var _onBeforeReady = new GaiaSignal();
	
	var _onPreloadSiteProgress = new GaiaSignal();
	
	
	var _firstTime = true;
	var _lockTransit = 0;
	
	var _idGen = 0;
	var _timestamp = 0;
	
	function _getValidBranch(branchArr) {
		var len = branchArr.length;
		var i;
		var path = "";
		var curParent = _rootNode;
		var testNode;
		var prop;
		for (i=0; i< len; i++) {
			prop = branchArr[i];
			testNode = curParent[prop];
			if (testNode) { 
				path += (curParent != _rootNode ? "/" : "") + prop;
				curParent = testNode;
			}
			else break;
		}
		return path;
	}
	
	function _getValidBranches(branchArr) {
		var arr = [];
		var len = branchArr.length;
		var i;
		var path = "";
		var curParent = _rootNode;
		var testNode;
		var prop;
		for (i=0; i< len; i++) {
			prop = branchArr[i];
			testNode = curParent[prop];
			if (testNode) { 
				path += (curParent != _rootNode ? "/" : "") + prop;
				arr.push(path);
				curParent = testNode;
			}
			else break;
		}
		
		return arr;
	}
	
	
	
	// content holder
	var contentWrapper;  // jQuery #contentWrapper else use body
	
	
	function getNewId() {
		return (_idGen++).toString();
	}	


	this.api = {
		"setRootURL": function(value) {
			rootURL = value;
		}
		,"enforceHTML4": function() {
			html4 = true;
		}
		,"getRootURL": function() {
			return rootURL;
		}
		,"setTitle": function(newTitle) {
			window.document.title = newTitle;
		}
		,"goto": function(path) {
			setSWFAddressValue( "/" + path);
		}
		,"setContentWrapper": function(jString) {
			contentWrapperQ = jString;
		}
		,"getValidBranch": function(path) {
			return _getValidBranch(path.split("/"));
		}
		,"getValidBranches": function(path) {
			return _getValidBranches(path.split("/"));
		}
		,"bindHrefLinks": function(queryJ) {
			queryJ.click(hrefLinkHandler);
			//hashQueryLinks(queryJ);
		}
		,"unbindHrefLinks": function(queryJ) {
			queryJ.unbind("click", hrefLinkHandler);
			//unhashQueryLinks(queryJ);
		}
		,"bindRelLinks": function(queryJ) {
			queryJ.click(relLinkHandler);
		}
		,"unbindRelLinks": function(queryJ) {
			queryJ.unbind("click", relLinkHandler);
		}
		,"getInitialPage": function() {
			return _startPage;
		}
		,"setConsiderPreload": function(method) {
			_considerPreload = method;
		}
		,"setDefaultTransitionIn": function(method) {
			_defaultTransitionInMethod = method;
		}
		,"getDefaultTransitionIn":function(method) {
			return _defaultTransitionInMethod;
		}
		,"getDefaultTransitionOut":function(method) {
			return _defaultTransitionOutMethod;
		}
		,"setDefaultTransitionOut": function(method) {
			_defaultTransitionOutMethod = method;
		}
		,"getCurrentPage": function() {
			return curPageObj;
		}
		,"getRoot": function() {
			return root;
		}
		,"getPage": function(path) {
			return _pathHash[path];
		}
		,"getPageBySrc": function(src) {
			return _pageHash[src];
		}
		,"getCurrentBranch": function() {
			return curPageObj ? curPageObj.path : "";
		}
		,"setDeeplink": function(path) {
			setSWFAddressValue( (curPageObj ? curPageObj.path : "") + "/" +  path);
		}
		,"setValue": function(path) {
			setSWFAddressValue( path);
		}
		,"getDeeplink": function() {
			var urler = html4 ? SWFAddress.getValue().slice(1) : rootURL ? History.getState().url.replace(rootURL, "") : History.getState().url.split("/").pop(); 
			var path =  html4 ? urler : _pageHash[urler] ?  _pageHash[urler].path : urler;  // todo: check if urler  reversion is okay or need explicit declartion (for mod-rewrite case)
			var validBranch = _getValidBranch( path.split("/") );
			validBranch = path.slice(validBranch.length);  // the deeplink result
			if (!validBranch &&  !html4) return SWFAddress.getValue(); 
			return validDL( validBranch );
		}
		,"getTargetPage": function() {
			return targetPageObj;
		}
		,"getPageAsset": function(id) {
			return _pageAssets[id];
		}
		,"getSiteAsset": function(id) {
			return _siteAssets[id];
		}
		,"setGaiaTransitionOut": function(val) {
			root["gaiaTransitionOut"] = val;
		}
		,"setGaiaTransitionIn": function(val) {
			root["gaiaTransitionIn"] = val;
		}
		,"setGaiaTransitionOutComplete": function(val) {
			root["gaiaTransitionOutComplete"] = val;
		}
		,"setGaiaTransitionInComplete": function(val) {
			root["gaiaTransitionInComplete"] = val;
		}
		,"getCurrentContent": function() {
			return currentContent;
		}
		,"getPreloadJS": function() { return _preloadJS; }
		,"getValue": function() { if (html4) return SWFAddress.getValue(); var urler = rootURL ? History.getState().url.replace(rootURL, "") : History.getState().url.split("/").pop(); return "/"+(_pageHash[urler] ?  _pageHash[urler].path : ""); } //SWFAddress.getValue  // temp pop
		,"getTitle": function() { return window.document.title; } 
		,"onDeeplink": _onDeeplink
		,"onBeforeGoto": _onBeforeGoto
		,"onAfterGoto": _onAfterGoto
		,"onBeforePreload": _onBeforePreload
		,"onAfterPreload": _onAfterPreload
		,"onBeforeReady":_onBeforeReady
		,"onBeforeTransitionIn": _onBeforeTransitionIn
		,"onAfterTransitionIn": _onAfterTransitionIn
		,"onBeforeTransitionOut": _onBeforeTransitionOut
		,"onAfterTransitionOut": _onAfterTransitionOut
		,"onAfterComplete": _onAfterComplete
		,"onPreloadSiteProgress": _onPreloadSiteProgress
		,"lockViewport": function() { _lockTransit |= 2; }
		,"unlockViewport": function() { _lockTransit ^= 2; }
		,"setupLockViewport": function() {
			if ("ontouchmove" in document) {
				document.ontouchmove = function(e){
					if (_lockTransit || _pageTransiting) e.preventDefault();
				}
			}
		}
	}
	
	function linkHandler(href, isPath) {
		
		var pageDoc = isPath ? _pathHash[href] :  _pageHash[href];
		if (pageDoc) {
			setSWFAddressValue((isPath ? href : pageDoc.path));
			return false;
		}
		else { // go defualt link?
			
		}
		return false;
	}
	function relLinkHandler(e) {
		
		return linkHandler($(e.currentTarget).attr("rel"), true);
	}
	function hrefLinkHandler(e) {
		var elem = $(e.currentTarget);
		var srcHref = elem.attr("href");
		var href;
		var hrefHashIndex = srcHref.indexOf("#");
		href = hrefHashIndex >=0 ? srcHref.slice(0, hrefHashIndex) : srcHref;
		var hashValue = hrefHashIndex >= 0 ?  srcHref.slice(hrefHashIndex+1) : null;
		
		
	
		
		var rel = hashValue;
		
		var pageDoc =  _pageHash[href];
		if (pageDoc) {
			setSWFAddressValue(pageDoc.path + (rel ? "/"+rel : "") );
			return false;
		}
		else { // go defualt link?
			
		}
		return false;
	}
	
	
	
	function Promise(handler) {
		var handler = handler;
		var time = _timestamp;
		function myHandler() {
			if (_timestamp > time) return;
			handler.apply(null, arguments);
		}
		return myHandler;
	}
	
	function JSONAsset(id, src) {
		this.src = src;
		this.id = id;
		
		var time = _timestamp;
		var _data;
		var _loaded = false;
		var _req;
		
		function _setData(data) {
			return data;
		}
		function getData() {
			return _data;
		}
		
		function onComplete(data) {
			_setData(data);
			_loaded = true;
			if (_timestamp > time) return;
			delayPoploadCount();
		}
		function onErrorHandler() {
			if (_timestamp > time) return;
			GaiaDebug.log("[ImageAsset ]Failed to load JSON:"+src);
			delayPoploadCount();
		}
		function abort() {
			_req.abort();
		}
		this.abort =abort;
		
		this.isLoaded = function() {
			return _loaded;
		};
		
		
		_req = $.getJSON(src, onComplete, onErrorHandler);
	}
	
	
	function ImageAsset(id, src) {
		this.src = src;
		this.id = id;
		
		var time = _timestamp;
		
		var image = new Image();
		var _loaded = false;
		image.onload = onComplete;
		image.onerror = onErrorHandler;
		image.src = src;
		
		function onComplete() {
			if (_timestamp > time) return;
			_loaded = true;
			if (!_domCacheHash[src]) {
				_domCacheHash[src] = true;
				_domCache.append('<img src="'+src+'"></img>');
				_domCache.append('<div style="background-image:url('+src+')"></div>');
			}
			delayPoploadCount();
		}
		function onErrorHandler() {
			if (_timestamp > time) return;
			GaiaDebug.log("[ImageAsset ]Failed to load image:"+src);
			delayPoploadCount();
		}
		function abort() {
			image.src = null;
		}
		this.abort =abort;
		
		this.isLoaded = function() {
			return _loaded;
		};
	}
	ImageAsset.prototype.type = "image";
		
	
	function KeyValue(src, pageAssets, title, id, json) {
		this.src = src;
		this.title = title || "Untitled";
		//this.assets = _stackAssets.concat();
		//collectAssets(this.assets, pageAssets);
		this.id = id;
		this.pageAssets = [];
		collectAssets(this.pageAssets, pageAssets);
		this.json = json;
		
		this.path = _stackIds.join("/");
	}
	

	
	function gotoPageURL(url, underGaia) {
		var pageDoc = _pageHash[url];
	
		
		if (!pageDoc) return false;
		if (!underGaia) _onBeforeGoto.dispatch(pageDoc);
		
		if (targetPage == url && !underGaia) return 1;
		targetPage = url;
		
		
		targetPageObj = pageDoc;
		targetBranch = pageDoc.path;
	//	SWFAddress.setTitle( _siteTitle.replace("%PAGE%", pageDoc.title) );
		api.setTitle( _siteTitle.replace("%PAGE%", pageDoc.title) );
		
		
		
		
		
		if (!underGaia) _onAfterGoto.dispatch(pageDoc);
		if (curPage == url) return 2;	
		
		
		
		
		_isInterrupted = false;
		
		if (_pageTransiting ) {   // INTERRUPT
			//log(" interrupt transitionIn:" + _isIn);
			_isInterrupted = _isIn;	
			//if (!underGaia) _onAfterGoto.dispatch(pageDoc);
			return 3;
		}
		
		if (currentContent != null) {
			transitionOutContent();
			//if (!underGaia) _onAfterGoto.dispatch(pageDoc);
			return true;
		}

		
		loadContent();
		//if (!underGaia) _onAfterGoto.dispatch(pageDoc);
		return 4;
	}
	
	function loadContent() {
		_lockTransit |= 1;
	//	if (_loading) alert("INTerupt load!");
		_timestamp++;
	
		var i;
		for (i in _ajaxHash) {
			_ajaxHash[i].abort();
		}
		_ajaxHash = {};
		
		loadCount = 0;
		showPreloader();  
		_onBeforePreload.dispatch();
		
		
		curPage = targetPage;
	
		
		var pageDoc = _pageHash[targetPage];
		curPageObj = pageDoc;
		
		registerAssetList( pageDoc.pageAssets, false );

		
		/*** Ajax load append content ***/
		if (_ajaxReq!=null) {
			_ajaxReq.abort();
		}
		loadCount++;
		//GaiaDebug.log("Add:"+loadCount);
		_ajaxReq = $.ajax(targetPage, { cache: true, data: {ajax:1,gaia:birthTime}  } )
		.done(function(e) { 
			
			var elem = $(e);
			if (e.charAt(1) != "!") { 
				currentContent = elem;
			}
			else {   // got html doc type
				currentContent = elem.find(contentWrapperQ);
			
				currentContent = currentContent.children();

				if (currentContent.length == 0 ) {
					GaiaDebug.log("Failed to retrieve contentWrapper:"+e);
					currentContent = $("<div id='contentWrapperFailed'>Content retrieved from contentWrapper failed</div>");
				}
			}	
			popLoadCount(e);
		})
		.fail(loadFailedDomHandler);
	
	}
	
	function popLoadCount(param) {
		
		loadCount--;	
		//GaiaDebug.log(loadCount+ "," +param);
		if (loadCount == 0) {
		//setTimeout(doAjaxReady,1 );
			doAjaxReady();
			
		}
		
		if (loadCount < 0) {
			alert("SHOULD NOT BE lower than zero load count! Did transitionOutComplete callback trigger multiple times?");
		}
	}
	
	function doAjaxReady() {  // when page is loaded

		//currentContent.trigger('ready');
		//if (hrefHash2[curPage]) {
			//linkSubContent3();
		//}
		//linkSubContentAny();
		if (_firstTime) {
			//_assetHash= {};
			$(document).trigger("gaiaFirstLoad");
			_firstTime = false;
		}
		hidePreloader();
		_onAfterPreload.dispatch();

		contentWrapper.append(currentContent);

		api.bindHrefLinks( _gaiaHrefLinks=currentContent.find("a.gaiaHrefLink"));
		api.bindRelLinks( _gaiaRelLinks = currentContent.find(".gaiaRelLink"));
		//$(document).trigger("ready");
		_onBeforeReady.dispatch();
		if (root["gaiaReady"]) root.gaiaReady(currentContent);
		transitionInContent();
	}
	
	function transitionInContent() {
	//	GaiaDebug.log("TRANSITION IN");
		_pageTransiting = true;
		_lockTransit = _lockTransit |= 1;
		_onBeforeTransitionIn.dispatch();
		_isIn= true;
		
		if (!root["gaiaTransitionIn"]) {
			if (_defaultTransitionInMethod == null) {
			
				currentContent.css("opacity", 0);
				currentContent.stop();
				currentContent.animate({opacity:1}, {duration:600}).promise().done( delayTransitionInComplete );
			}
			else _defaultTransitionInMethod(delayTransitionInComplete, currentContent);
		}
		else {
			root.gaiaTransitionIn(delayTransitionInComplete, currentContent);
		}
		
		


	}

	
	 // async delay required due to firefox flickering with webkit transitions
	function delayTransitionInComplete() { 
		setTimeout(transitionInComplete, 1);
	}
	function delayTransitionOutComplete() {
		setTimeout(transitionOutComplete, 1);
	}
	
	function transitionInComplete() {
	//	GaiaDebug.log("TRANSITION IN COMPLETE");
		_pageTransiting = false;
		if (_isInterrupted) {
		//	log("Complete interrupt:"+targetPage);
		_isInterrupted = false;
			var result = gotoPageURL(targetPage, true);
			
			return;
		}
		if (root["gaiaTransitionInComplete"]) root["gaiaTransitionInComplete"](currentContent);
		//currentContent.trigger("transitionInComplete");
		_onAfterTransitionIn.dispatch();
		
		
		_onAfterComplete.dispatch();
		_lockTransit = 0;
		
		//alert("COMPLETE!");
	}

	function transitionOutComplete() {

		//GaiaDebug.log("OUT COMPLETE");
		_pageTransiting = false;
		if (root["gaiaTransitionOutComplete"]) root["gaiaTransitionOutComplete"](currentContent);
		//currentContent.trigger("transitionOutComplete");
		try {
		delete root["gaiaTransitionIn"];
		delete root["gaiaTransitionOut"];
		delete root["gaiaReady"];
		delete root["gaiaTransitionInComplete"];
		delete root["gaiaTransitionOutComplete"];
		}
		catch(e) {
			root["gaiaTransitionIn"] = null;
			root["gaiaTransitionOut"] = null;
			root["gaiaReady"] = null;
			root["gaiaTransitionInComplete"] = null;
			root["gaiaTransitionOutComplete"] = null;
		}
		 
		var i;
		for (i in _assetHash) {
			deleteAsset(i);
		}
		if (_gaiaHrefLinks) api.unbindHrefLinks( _gaiaHrefLinks);
		if (_gaiaRelLinks) api.unbindRelLinks( _gaiaRelLinks);
		
		_onAfterTransitionOut.dispatch();
		
		//alert("OUT COMPLETE!");
		contentWrapper.empty();
		
		_pageAssets = {};
		loadContent();
		//gotoPageURL(targetPage, true);

	}
	function transitionOutContent() {
		_onBeforeTransitionOut.dispatch();
		
		//hrefHash3 = {};
		_pageTransiting =true;
		_isIn = false;
		
		if (!root["gaiaTransitionOut"]) {
			
		if (_defaultTransitionOutMethod == null) {
			currentContent.stop();
			currentContent.animate({opacity:0},{duration:600}).promise().done( delayTransitionOutComplete );
		}
			else _defaultTransitionOutMethod(delayTransitionOutComplete, currentContent);
		}
		else {
			root.gaiaTransitionOut(delayTransitionOutComplete, currentContent);
		}
		
		
		//	log("transitionOutContent:"+curPage+", "+currentContent.attr("id"));
			//transitionOutComplete();
		//currentContent.trigger("transitionOut");
	}
	
	function showPreloader() {
		_loading = true;
		$("#preloader").css("visibility", "visible");
	}
	function hidePreloader() {
		_loading = false;
		$("#preloader").css("visibility", "hidden");
	}
	
	function collectPage(pageData) {
		var srcAttrib = pageData["@attributes"] ? pageData["@attributes"].src : null;
		if (srcAttrib == undefined || srcAttrib == null) {
			srcAttrib = "not_defined.html";
			//throwError("Src must defined!"+srcAttrib+","+pageData["@attributes"].id);
		}
		var idAttrib = pageData["@attributes"].id;
		if (idAttrib == undefined || idAttrib == null) {
			throwError("Id attrib must defined!"+idAttrib+", "+srcAttrib);
		}
		_stackIds.push(idAttrib);
		var nodeChild  = {id:idAttrib};
		if (_stackNodes.length != 0) _stackNodes[_stackNodes.length - 1][idAttrib] = nodeChild
		else _rootNode[idAttrib] = nodeChild;
		_stackNodes.push(nodeChild);
		//var count = pushAssets(pageData.asset);
		var kv = new KeyValue(srcAttrib, pageData.asset, pageData["@attributes"].title, idAttrib, pageData);
		if (landingPage == null) landingPage = kv;
		_pageHash[srcAttrib] = kv;
		_pathHash[kv.path] = kv;

		collectPages(pageData);
		_stackIds.pop();
		_stackNodes.pop();
		/*
		while(--count > -1) {
			_stackAssets.pop();
		}
		*/
	}
	
	function isStackable(asset) {
		return asset["@attributes"].stack == "true";
	}
	
	function getAsset(asset) {
		return asset;
	}
	
	
	function pushAssets(assets, alwaysPush) {
		if (!assets) return;
		var count = 0;
		if (assets.hasOwnProperty("length")) {
			var i = assets.length;
			while(--i > -1) {
				if (alwaysPush || isStackable(assets[i])) {
					_stackAssets.push(getAsset(assets[i]));
					count++;
				}
			}
		}
		else {
			if (alwaysPush || isStackable(assets)) {
				_stackAssets.push(getAsset(assets));
				count++;
			}
		}
		return count;
	}
	
	function collectAssets(collector, assets) {
		if (!assets) return;
		if (assets.hasOwnProperty("length")) {
			var i = assets.length;
			while(--i > -1) {
				if (!isStackable(assets[i])) {
					collector.push(getAsset(assets[i]));
				}
			}
		}
		else {	
			if (!isStackable(assets)) {
				collector.push(getAsset(assets));
			}
		}
	}

	function getFileExt(src) {
		var arr = src.split(".");
		return arr[arr.length-1];
	}
	
	function alertTraceObj(obj) {
		var i;
		var arr = [];
		for ( i in obj) {
			arr.push(obj[i]);
		}
		alert(arr);
	}
	
	function loadFailedDomHandler(e) {
		currentContent = $("<div id='loadFailedHandler'>Page doc load failed</div>");
		GaiaDebug.log("Load failed:"+(e.currentTarget ?   e.currentTarget.href || e.currentTarget.src : "undefined" ));
		delayPoploadCount(e);
	}
	
	function registerAsset(asset, dontHash) {
		var attrib =asset["@attributes"];
		var src = attrib.src;
		
		if (_assetHash[src]) return;
		
		var ext = getFileExt(src);
		var req;
		var node;
		var useAssetHash;
		
		if (ext == "css") {
		
			if (!dontHash) _assetHash[src] = asset;
			var mediaAttrib =  attrib.media;
			mediaAttrib = mediaAttrib ? ' media="'+mediaAttrib+'"' : "";
				if (document.createStyleSheet) {
				document.createStyleSheet(src);
			}
			else {
				node = $('<link rel="stylesheet"'+mediaAttrib+' type="text/css" href="'+src+'"></link>');
				_head.append( node );	
			}
			
			//loadCount++;
			//GaiaDebug.log("AddCSS:"+loadCount 	);
		//	node.load( delayPoploadCount2 );
		//	node.error(loadFailedDomHandler);
		}
		else if (ext == "js") {
			loadCount++;
		//	GaiaDebug.log("AddJS:"+loadCount);
			req = $.getScript(src + "?"+birthTime, Promise(delayPoploadCount)).fail(Promise(SrcFailedProxy(src)));
			 if (!dontHash)  _ajaxHash[getNewId()] = req;  
		}
		else if (ext == "jpg" || ext == "png" || ext == "gif" ) {   // TODO: extension to class map for subsequent assets instead!
			loadCount++;
			
			req = new ImageAsset(attrib.id || src, src);
			if (!dontHash)  _ajaxHash[getNewId()] = req;  
			useAssetHash = !dontHash ? _pageAssets : _siteAssets;
			useAssetHash[ attrib.id || src ] = req;
		}
		else if (ext === "json") {
			loadCount++;
			req = new JSONAsset(attrib.id || src, src);
			
			if (!dontHash)  _ajaxHash[getNewId()] = req;  
			useAssetHash = !dontHash ? _pageAssets : _siteAssets;
			useAssetHash[ attrib.id || src ] = req;
			
			
		}
		
	}
	
	function delayPoploadCount() {
		setTimeout(popLoadCount,2);
	}
	
	function delayPoploadCount2() {

		setTimeout(popLoadCount,2);
	}
	function SrcFailedProxy(src) {
		this.src = src;
		function handler() {
			GaiaDebug.log("Load failed:"+src);
			popLoadCount(src);
		}
		return handler;
	}
	
	function deleteAsset(assetSrc) {
	
		_head.find("link[href='"+assetSrc+"']").remove();
		try {
		delete _assetHash[assetSrc];
		}
		catch(e) {
			_assetHash[assetSrc] = null;
		}
		
	}
	function registerAssetList(list, dontHash) {
		var i;
		var len = list.length;
		for(i=0; i< len; i++) {
			registerAsset( list[i], dontHash );
		}
	}
	
	function collectPages(data) {
		var pageList = data.page;
		if (!pageList) {
			return;
		}
		if (pageList.hasOwnProperty("length")) {
			var i = 0;
			var len = pageList.length;
			for(i=0; i<len; i++) {
				collectPage(pageList[i]);
			}
		}
		else {
			collectPage(pageList);
		}
	}
	
	function throwError(data) {
		alert(data);
		throw new Error(data);
	}
	
	function onSiteXMLReady(data) {
		
		var pageList = data.site;
		var defaultTitle = "Kilogaiajax Untitled Site: %PAGE%";
		_siteTitle = data.site["@attributes"] ? data.site["@attributes"].title || defaultTitle : defaultTitle;
		if (!pageList) {
			throwError("No site node found!");
			return;
		}
		pageList = pageList.page;
		if (!pageList) {
			throwError("No site root index page found!");
			return;
		}
		if (pageList.hasOwnProperty("length")) {
			throwError("SHould have only 1 root page");
			return;
		}
		pushAssets( pageList.asset, true );
		
	
		collectPages( pageList );
		
		

		if (root["gaiaRedirect"]) {
			var docLoc = document.location.toString();
			var docIndex = docLoc.indexOf("#");
			docLoc = docIndex != -1 ? docLoc.slice(docIndex+1) : null;
			var tryRedirect =api.getValidBranch( root["gaiaRedirect"] );
			if (_pathHash[tryRedirect]) { //pageList["@attributes"].src+
				document.location = ".#/"+tryRedirect + (docLoc ? "/"+docLoc : "");
				return;
			}
			else {
				document.location = ".#/"+landingPage.path  + (docLoc ? "/"+docLoc : "");	
				return;
			}
		}
		//alert(  History.getState().url.split("/").pop() );
		//var tryPath = api.getValidBranch( SWFAddress.getValue().slice(1) );  //// tem pop
		_startPage = html4 ?  _pathHash[api.getValidBranch( SWFAddress.getValue().slice(1) )] : _pageHash[rootURL ? History.getState().url.replace(rootURL, "") : History.getState().url.split("/").pop()];

		
		var readyCall = (function() {	
			
			//SWFAddress.addEventListener(SWFAddressEvent.CHANGE, handleChange);
			if (!html4) {
				History.Adapter.bind(window,'statechange', handleChange);
				SWFAddress.addEventListener(SWFAddressEvent.CHANGE, hashChange);
			}
			else {
				SWFAddress.addEventListener(SWFAddressEvent.CHANGE, handleChange);
			}
			//History.Adapter.bind(window,'onanchorchange', hashChange);
		
			api.bindHrefLinks( $("body a.gaiaHrefLink") );
			api.bindRelLinks( $("body .gaiaRelLink") );
		
		$(document).trigger("gaiaReady");
			registerAssetList(_stackAssets, true);
			if (_startPage) {
				gotoPageURL( _startPage.src);
				return;
			}
			else setSWFAddressValue(landingPage.path);
		});
		
		
				
		if (  data.site.preload && _considerPreload() ) preloadManifest(data.site.preload,readyCall );
		else {
			readyCall();
		}
		

		
	}
	
	function getCleanManifest(manifest) {
		var i;
		var attr;
		var obj;
		var p;
		var len = manifest.length;
		for (i=0; i<len; i++) {
			 obj = manifest[i];
			attr = obj["@attributes"];
			if (attr) {
				for (p in attr) {
					obj[p] = attr[p];
				}
				delete obj["@attributes"];
				
			}
		
		}
		return manifest;
	}
	
	function preloadManifest(manifest, completion) {
		var preloadJS = new PreloadJS();
		_preloadJS = preloadJS;
        preloadJS.onComplete = completion;
		if (!manifest.hasOwnProperty("length")) manifest = [manifest];
		manifest = getCleanManifest(manifest);
		preloadJS.loadManifest(manifest);
	}
	
	function setSWFAddressValue(value) {
		///*
		if (html4) {
			try {
				SWFAddress.setValue(value);
			}
			catch(e) {
				window.location = "#"+value;
			}
			return;
		}
		//*/
		//if (_pathHash[value] == undefined) alert("SORRY");

		History.pushState(null, null, _pathHash[value].src);
		
	}
	
	function onDocumentReady() {
		

		_domCache = $("<div id='gaiaCache' style='display:none'></div>");
		$("html body").append(_domCache);
		
		_head = $("head");
		contentWrapper = $(contentWrapperQ);
		if (contentWrapper.length == 0) {
			contentWrapper = $("<div id='contentWrapper'></div>");
			$("html body").prepend(contentWrapper);
		}
		contentWrapper.empty();
		

		
		$.ajax({
			url: root["gaiaSiteJson"] || "scripts/site.php",
			dataType: 'json',
			success: onSiteXMLReady
		});
		
		
		
		$(document).unbind("ready", onDocumentReady);
		
	}
	

	$(document).ready(onDocumentReady);
	
	
	function loadPageK(kv) {
		gotoPageURL(kv.src);
	}
	
	function validDL(str) {
		return str != "" ? str : "/";
	}
	
	
	function hashChange() {  // html5 hash change with SWFAddress
		_onDeeplink.dispatch( api.getDeeplink() );
	}

	
	function handleChange(e) {
	
		// something in prev project for depeciating
		//if (hrefRelId == null && _isIn && currentContent!=null) currentContent.trigger(e.type, e);
		//hrefRelId = null;
		
		//if (e.cancelled) {  // some flag to cancel default behaviour in previous project..hmm.
		//	return;
		//}
		

		var fullValue = api.getValue();
	
		var path = fullValue.slice(1);
		// TODO: remove trailing slashes for path??
	
		
		var validBranch = _getValidBranch( path.split("/") );
		
		if ( validBranch  ) {  
			loadPageK( _pathHash[validBranch]  );
			//if (validBranch == path) return;
			// else got deeplink
		//	alert(validDL( path.slice(validBranch.length) ));
			_onDeeplink.dispatch( validDL( path.slice(validBranch.length) ) );
		}
		else {
			loadPageK( landingPage.path  );
			_onDeeplink.dispatch( validDL(fullValue) );
		}
		
	
		
	}
	
	
	

	return this.api;  //!important for public api access!
})(this);