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
		var i;
		if (arguments.length) {
			
			for (i=0; i< len; i++) {
			
				_subscribers[i].apply(null, arguments); //	alert("A:"+_subscribers[i] + ", "+arguments);
				
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
	var _lastValue = null;
	
	History.isTraditionalAnchor = function(url_or_hash) {  
		return true;
	};
	
	if (!root["SWFAddress"]) {  // Use jquery address if SWFAddress not found!
		
		root["SWFAddressEvent"] = {
			"CHANGE" : "change"
		};
		
		root["SWFAddress"] = new (function($) {
			this.fragId = "";
			this.getValue= function() {
				var v = $.address.value();
				v = v.charAt(0) != this.fragId ? v : v.slice(1);
				return v;
			}
			this.setValue =  function(val) {
				$.address.value(val);
			}
			this.addEventListener = function(val, method) {
				if (val === SWFAddressEvent.CHANGE) {
					$.address.change(method);
				}
			}
		})(jQuery);
		
	}
	
	if (SWFAddress["fragId"] == null) SWFAddress["fragId"] = "";
	//SWFAddress.fragId = "!";
	
	var contentWrapperQ = "#contentWrapper";
	var _fakeURLState = null;
	var birthTime = new Date().getTime();
	var rootURL = "";

	
	// temporary stacks for collecting stuff
	var _stackAssets = [];
	var _stackIds = [];
	var _stackNodes = [];
	
	var _rootNode = {};
	var _ajaxHash = {};
	
	var _gaiaLinkHash = {};
	var _gaTracker;
	
	var _head;
	
	// Our page hashes
	var _pageHash = {};  // Key: href src
	var _pathHash = {};	 // Key: path for swfaddress
	var _assetHash = {};
	var _pageAssets = {};
	var _siteAssets = {};
	var _domCacheHash = {};
	var landingPage;
	
	var _routing = false;
	
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
	var _siteNode;
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
	var _onSiteXMLReady = new GaiaSignal();
	var _onChange = new GaiaSignal();
	
	var _onPreloadSiteProgress = new GaiaSignal();
	
	var _onDemandPageHandler;
	
	
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
	
	function _getValidBranchNode(branchArr) {
		var len = branchArr.length;
		var i;
		var curParent = _rootNode;
		var testNode;
		var prop;
		for (i=0; i< len; i++) {
			prop = branchArr[i];
			testNode = curParent[prop];
			if (testNode) { 
				curParent = testNode;
			}
			else break;
		}
		return curParent;
	}
	
	function _getSrcURL(url, qStrAbs) {
		url = url.split("#")[0];
		url =  rootURL ? url.replace(rootURL, "") : url.split("/").pop();
		url = !qStrAbs ? url.split("?")[0] :  qStrAbs === true ? url : qStrAbs(url);
		if (qStrAbs) {
			var splitQStr = url.split("?");
			if (splitQStr.length > 1  ) {
				if (splitQStr[0].indexOf(".") < 0 && splitQStr[0].charAt(splitQStr.length-1) != "/")  url = splitQStr[0] + "?" + splitQStr[1];
			}
		}
	
		url = url.indexOf(".") < 0 ? url.charAt(url.length-1) != "/" ? url : url.slice(0, url.length-1)   : url;
	
		url =  url != "" ? url : landingPage ? landingPage.src : "";
		
		return url;
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
	
	
	var onDemandPageURL;
	var onDemandPath;

	function addPage(url, path, id, assetPath, title, qStrAbs) {
		
		var parentPath = path;
		if (!path) path = id;
		else path += "/"+id;
		path += path ? "/"+id : id;
		
		
		id = id != null ? id : "~ondemand";
		title = title != null ? title :  (curPageObj ? curPageObj.title : "Untitled");
	
		var assets;
		
		
		assetPath = _pathHash[assetPath];
		assets = assetPath != null ? assetPath.pageAssets : null;
		
		var dPageData = { "@attributes":{id:id, title:title, id:id, src:url, query:(qStrAbs? "1" : false)} };
		var kv =new KeyValue(url, assets, title, id, dPageData, path );
		
		_getValidBranchNode(parentPath.split("/"))[id] = {id:id};
		
		_pageHash[url] = kv;
		_pathHash[path] = kv;
	}
	
	this.api = {
		"setOnDemandPage": function(url, path, id, assetPath, title) {  // set an on-demand page (on-the-fly) for viewing
			
			if (onDemandPageURL && _pageHash[onDemandPageURL]) { // delete previous entry to avoid bloating!
				//delete _pageHash[onDemandPageURL];  
			}
			if (onDemandPath && _pathHash[onDemandPath]) { // delete previous entry to avoid bloating!
	
				//delete _getValidBranchNode(onDemandPath.split("/"))[_pathHash[onDemandPath].id];
				//delete _pathHash[onDemandPath];  
			}
			
			addPage(url, path, id, assetPath, title,  _pathHash[assetPath] && _pathHash[assetPath].json["@attributes"].query == "1" );
			onDemandPageURL = url;
			onDemandPath = path;
		}
		,"setOnDemandPageHandler": function(method) {
			_onDemandPageHandler = method;
		}
		,"handleChange": function() {
			handleChange();
		}
		,"setRootURL": function(value) {
			rootURL = value;
		}
		,"setRouting": function(value) {
			_routing = value;
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
		,"setPageTitle": function(newTitle) {
			window.document.title =  _siteTitle.replace("%PAGE%", newTitle);
		}
		,"goto": function(path) {
			setSWFAddressValue( path);
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
		,"getSrcURL":_getSrcURL
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
			if (!html4) {
				SWFAddress.setValue(path);			
				return;
			}
			if (path.charAt(0) === "/") path = path.slice(1);
			setSWFAddressValue( (curPageObj ? curPageObj.path : "") + "/" +  path);
		}
		,"setValue": function(path) {
			setSWFAddressValue(path);
		}
		,"getDeeplink": function() {
			if (!html4) return validDL( History.getHash() );  // should we enforce validDL as per strict SWFAddress mode?
			var path = SWFAddress.getValue().slice(1);
			var validBranch = _getValidBranch( path.split("/") );
			return validDL( path.slice(validBranch.length) );
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
		,"getSiteNode": function() {
			return _siteNode;
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
		,"getValue": function() { if (html4) return SWFAddress.getValue(); var dlAdd = History.getHash(); dlAdd = dlAdd === "/" ? "" : dlAdd; var state = _fakeURLState || History.getState(); var urler = _getSrcURL(state.url); if (_pageHash[urler] && _pageHash[urler].json["@attributes"].query == "1") urler = _getSrcURL(state.url, true); return "/"+(_pageHash[urler] ?  _pageHash[urler].path :  urler.indexOf(".") < 0 ? urler : "") + dlAdd; } //SWFAddress.getValue  // temp pop
		,"getURL5": function() { return _getSrcURL(History.getState().url); } //SWFAddress.getValue  // temp pop
		,"getTitle": function() { return window.document.title; } 
		,"onDeeplink": _onDeeplink
		,"onSiteXMLReady": _onSiteXMLReady
		,"onChange": _onChange
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
		
		//if (pageDoc) {
			
			setSWFAddressValue((isPath ? href : pageDoc.path));
		//	return false;
		//}
		//else { // go defualt link?
			
		//}
		return false;
	}
	function relLinkHandler(e) {
		var value = $(e.currentTarget).attr("href");
		if (html4) {
			try {
				SWFAddress.setValue(SWFAddress.fragId+"/"+value);
			}
			catch(e) {
				window.location = "#"+value;
			}
			return false;
		}
		
		if (_lastValue === value) return false;
		

		var validBranch = _getValidBranch( value.split("/") );
		var hashAppend = value.slice(validBranch.length);
		History.pushState({id:SUID++}, null, value  );
		//GaiaDebug.log("Pushing state:"+replaceState + ", "+validBranch + ", " +_pathHash[validBranch].src + (hashAppend != "/" && hashAppend ? "#"+hashAppend : "" ) );
		
		return false;
	}
	function hrefLinkHandler(e) {
		
		e.preventDefault();
		
		var elem = $(e.currentTarget);
		var srcHref = elem.attr("href") || "";
		var href;
		var hrefHashIndex = srcHref.indexOf("#");
		href = hrefHashIndex >=0 ? srcHref.slice(0, hrefHashIndex) : srcHref;
		
	
		href = _getSrcURL(href);
		//alert("Resolved href:"+href);
		
		var hashValue = hrefHashIndex >= 0 ?  srcHref.slice(hrefHashIndex+1) : null;
	
		
		var rel = hashValue;
		var pageDoc =  _pageHash[href];
	
		if (!pageDoc && _onDemandPageHandler) {	
			_onDemandPageHandler(href, elem);
			pageDoc = _pageHash[href];
		}
		
		if (pageDoc) {
			setSWFAddressValue(pageDoc.path + (rel ? rel.charAt(0) != "/" ? "/"+rel : rel : "") );

			return false;
		}
		else { // go defualt link?
			GaiaDebug.log("Could not resolve hrefLink:"+href);
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
		
	
	function KeyValue(src, pageAssets, title, id, json, path) {
		this.src = src;
		this.title = title || "Untitled";
		//this.assets = _stackAssets.concat();
		//collectAssets(this.assets, pageAssets);
		this.id = id;
		this.pageAssets = [];
		collectAssets(this.pageAssets, pageAssets);
		this.json = json;
		
		this.path = path || _stackIds.join("/");
	}
	

	
	function gotoPageURL(url, underGaia) {
		if (!underGaia) _onBeforeGoto.dispatch();
		var pageDoc = _pageHash[url];

		if (!pageDoc) return false;
		
		
		if (targetPage == url && !underGaia) return 1;
		targetPage = url;
		
		
		targetPageObj = pageDoc;
		targetBranch = pageDoc.path;
	//	SWFAddress.setTitle( _siteTitle.replace("%PAGE%", pageDoc.title) );
		api.setTitle( _siteTitle.replace("%PAGE%", pageDoc.title) );
		
		
		
		
		
		if (!underGaia) _onAfterGoto.dispatch();
		if (curPage == url) return 2;	
		
		
		
		
		_isInterrupted = false;
		
		if (_pageTransiting ) {   // INTERRUPT
			//log(" interrupt transitionIn:" + _isIn);
			_isInterrupted = _isIn;	
			//if (!underGaia) _onAfterGoto.dispatch();
			return 3;
		}
		
		if (currentContent != null) {
		
			transitionOutContent();
			//if (!underGaia) _onAfterGoto.dispatch();
			return true;
		}

		
		loadContent();
		//if (!underGaia) _onAfterGoto.dispatch(pageDoc);
		return 4;
	}
	
	function loadContent() {
		_lockTransit |= 1;
		var i;
		if (_loading) {
			_pageAssets = {};
			for (i in _assetHash) {
				deleteAsset(i);
				
			}
			//alert("INTerupt load!");
		}
		_timestamp++;
	
		
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
			_ajaxReq["gaiaCancelled"] = true;
			_ajaxReq.abort();
		}
		loadCount++;
		//GaiaDebug.log("Add:"+loadCount);
		
		_ajaxReq = (pageDoc.json["@attributes"].query != "1" ? $.ajax(rootURL +  targetPage, { cache: true, data: {ajax:1,gaia:birthTime}  } ) : $.ajax(rootURL +  targetPage, { cache: false} ))
		.done(function(e) { 
			
			var elem = $("<div>"+e+"</div>");
			if (e.charAt(1) != "!") { 
				currentContent = elem.children();
			}
			else {   // got html doc type
				elem = elem.children();
				currentContent = elem.siblings(contentWrapperQ);
				currentContent = currentContent.children();
				if (currentContent.length == 0 ) {
					currentContent = elem.find(contentWrapperQ);
					currentContent = currentContent.children();
					
				}
				if (currentContent.length == 0 ) {
					GaiaDebug.log("Failed to retrieve contentWrapper:"+e);
					currentContent = $("<div id='contentWrapperFailed'>Content retrieved from contentWrapper failed</div>");
				}
		//		console.log(currentContent);
			}	
			popLoadCount(e);
		})
		.fail(loadFailedDomHandler);
	
	}
	
	function popLoadCount(param) {
		
		loadCount--;	
		//GaiaDebug.log(loadCount+ "," +param);
		if (loadCount == 0) {
		setTimeout(doAjaxReady,1 );
		//	doAjaxReady();
			
		}
		
		if (loadCount < 0) {
			//alert("SHOULD NOT BE lower than zero load count! Did transitionOutComplete callback trigger multiple times?");
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

		// allows multiple contentWrappers now!
		var primaryContentWrapper = $(contentWrapper[0]);
		currentContent.each( function(index, item) {
			item = $(item);
			
			// do not add if item id already exists, assumed keep  (or consider perform replacement?)
			if (item.attr("id") && $("#"+item.attr("id")).length) {
				var toReplace = $("#"+item.attr("id"));
				currentContent[index] = toReplace[0];
				return;
			}
			
			var parentId = item.parent().attr("id");
			if (parentId && $("#"+parentId).length ) {
				$("#"+parentId).append(item);
				
			}
			else {
				primaryContentWrapper.append(item);
			}
		});

		api.bindHrefLinks( _gaiaHrefLinks=currentContent.find("a.gaiaHrefLink"));
		api.bindRelLinks( _gaiaRelLinks = currentContent.find("a.gaiaRelLink"));
		//$(document).trigger("ready");
		_onBeforeReady.dispatch();
		if (root["gaiaReady"]) root.gaiaReady(currentContent);
		transitionInContent();
	}
	
	function transitionInContent() {
		
		if (_gaTracker) {
			_gaTracker = root["_gaq"] || (root["_gaq"]=[]);
			_gaTracker.push( ['_trackPageview', "/"+(_routing ? curPageObj.path : curPageObj.src)] );
			
		}
	
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
		//setTimeout(transitionInComplete, 0);
		transitionInComplete();
	}
	function delayTransitionOutComplete() {
		//setTimeout(transitionOutComplete, 0);
		transitionOutComplete();
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


	function filterGaiaKeep() {
		return !$(this).data("gaiakeep");
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
		//contentWrapper.empty();
		//alert(currentContent.length +":<prev");
		var checkFilter = currentContent.filter(filterGaiaKeep);
		checkFilter.remove();
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
		$("#preloader").css("visibility", "visible").addClass("show");
	}
	function hidePreloader() {
		_loading = false;
		$("#preloader").css("visibility", "hidden").removeClass("show");
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
			var i;
			var len = assets.length;
			for(i=0; i<len; i++) {
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
			var i;
			var len = assets.length;
			for(i=0; i<len; i++) {
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
		//alert( arr.length + ", :" + arr) ;
		if (arr.length == 1) {return "js"; } else {
			return arr[arr.length-1];
		}
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
		if (!e["gaiaCancelled"]) {
			GaiaDebug.log("Load failed dom:"+(e===_ajaxReq ));
			delayPoploadCount(e);
		}
	}
	
	function registerAsset(asset, dontHash) {
		var attrib =asset["@attributes"];
		var src = attrib.src;
		
		if (_assetHash[src]) return;
		
		var ext =  (attrib.type != null) ? attrib.type : getFileExt(src);
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
	
			//console.log(nSrc);
			req = $.getScript(src + ((src.indexOf("?") >=0 ) ? "" : ("?"+birthTime)), Promise(delayPoploadCount)).fail(Promise(SrcFailedProxy(src)));
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
		_siteNode = data.site;
		var gaAccount = data.site["@attributes"].gaAccount || null;
		if (gaAccount) {
			_gaTracker = root["_gaq"] || (root["_gaq"]=[]);
			_gaTracker.push(['_setAccount', gaAccount]); // your ID/profile  
		//		_gaTracker.push(['_setDomainName', 'none']);

			(function() {  
				var ga = document.createElement('script'); ga.type = 'text/javascript'; ga.async = true;  
				ga.src = ('https:' == document.location.protocol ? 'https://ssl' : 'http://www') + '.google-analytics.com/ga.js';  
				var s = document.getElementsByTagName('script')[0]; s.parentNode.insertBefore(ga, s);  
			})();
		}
		
		
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
		

		_onSiteXMLReady.dispatch();

		
		// From HTML5 link to HTML4 cases
		var url = window.location.href;  
		var filename =  _getSrcURL(url);
		var detectPage = _pageHash[filename]; //filename.indexOf(".") >= 0 ? _pageHash[filename] : _pathHash[ api.getValidBranch(filename) ];
		// need a detectURL link as well
		
		
		if (detectPage && detectPage.json["@attributes"].query == "1") {
			filename = _getSrcURL(url, true);
			detectPage  = _pageHash[filename];
		}
	
		if (html4 && detectPage && filename != landingPage.src) {
			root["gaiaRedirect"] = detectPage.path;  // TODO: include any necessary deeplinks into path
		}


		if (html4 && root["gaiaRedirect"]) {  // TODO: include any necessary deeplinks into path
			var docLoc = document.location.toString();
			var docIndex = docLoc.indexOf("#");
			docLoc = docIndex != -1 ? docLoc.slice(docIndex+1) : null;
			var tryRedirect =api.getValidBranch( root["gaiaRedirect"] );
			
			if (_pathHash[tryRedirect]) { //pageList["@attributes"].src+
			
				document.location = (rootURL ? rootURL : ".")+"#"+SWFAddress.fragId+"/"+tryRedirect + (docLoc ? docLoc.charAt(0) != "/" ? "/" + docLoc : docLoc   : "");
				return;
			}
			else {
				document.location = (rootURL ? rootURL : ".")+"#"+SWFAddress.fragId+"/"+landingPage.path  + (docLoc ? docLoc.charAt(0) != "/" ? "/" + docLoc : docLoc   : "");	
				return;
			}
		}

			var gotValidStartBranch = false;
		// Determine if link is an html4 link.. ie. is it from index page src? If so, determine _startPage from hash.
		if ( detectPage === landingPage) {  // link is html4 style
			_startPage =  _pathHash[ api.getValidBranch( SWFAddress.getValue().slice(1) )];
			gotValidStartBranch= _startPage !=undefined;
			if (!gotValidStartBranch) {
				
				if  ( !html4) _startPage = _pageHash[_getSrcURL(History.getState().url)]
				else _startPage = landingPage; 
			}
		}
		else {  // link is html5 style, assuming it wasn't redirected above by html4
			if (html4) alert("Failed to catch redirect for html4!");
			_startPage = detectPage;
		}
		
		var readyCall = (function() {	
			
			//SWFAddress.addEventListener(SWFAddressEvent.CHANGE, handleChange);
			if (!html4) {
				History.Adapter.bind(window,'statechange', handleChange);
				//History.Adapter.bind(window,'onanchorchange', hashChange); // doesnt't work, dunno why
				SWFAddress.addEventListener(SWFAddressEvent.CHANGE, hashChange);  
			}
			else {
				SWFAddress.addEventListener(SWFAddressEvent.CHANGE, handleChange);
			}
			//History.Adapter.bind(window,'onanchorchange', hashChange);
		
			api.bindHrefLinks( $("body a.gaiaHrefLink") );
			api.bindRelLinks( $("body a.gaiaRelLink") );
		
		$(document).trigger("gaiaReady");
			registerAssetList(_stackAssets, true);
			if (_startPage) {
				gotoPageURL( _startPage.src);
			
				if (!html4 && gotValidStartBranch) setSWFAddressValue(SWFAddress.getValue().slice(1), true);
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
	
	var SUID = 0;  // unique incrementing id to ensure each state is unique, even with the same url
	
	function setSWFAddressValue(value, replaceState) {
		///*
		
		if (html4) {
			try {
				SWFAddress.setValue(SWFAddress.fragId+"/"+value);
			}
			catch(e) {
				window.location = "#"+value;
			}
			return;
		}
		if (_lastValue === value) return;
		
		_lastValue = value;  // to asset immdeiate update change?
		
		//*/
		//if (_pathHash[value] == undefined) alert("SORRY");
		var validBranch = _pathHash[value] ? value : _getValidBranch( value.split("/") );  // go for exact match by default..
		var hashAppend = value.slice(validBranch.length);
		
		(replaceState ? History.replaceState : History.pushState)({id:SUID++}, null, rootURL + _pathHash[validBranch].src + ( hashAppend ? "#"+hashAppend : "" )  );
		//GaiaDebug.log("Pushing state:"+replaceState + ", "+validBranch + ", " +_pathHash[validBranch].src + (hashAppend != "/" && hashAppend ? "#"+hashAppend : "" ) );
		//GaiaDebug.log("change");
	}
	
	
	
	function onDocumentReady() {
		

		_domCache = $("<div id='gaiaCache' style='display:none'></div>");
		$("html body").append(_domCache);
		
		_head = $("head");
		contentWrapper = $(contentWrapperQ);
		if (contentWrapper.length == 0) {
			contentWrapper = $("<div id='contentWrapper'></div>");
			//	$("html body").prepend(contentWrapper);
		}
		
		//.filter( filterGaiaKeep )
		contentWrapper.children().remove();
		
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

		var src = _getSrcURL(window.location.href);  

		if (src != (targetPageObj || curPageObj).src) {

			_fakeURLState = { url:src };

		//GaiaDebug.log(fullValue + ", "+_getSrcURL(History.getState().url) + ", "+ _pageHash[_getSrcURL(History.getState().url)].path );

			_lastValue = api.getValue().slice(1);

			loadPageK(_pageHash[src]);  // ensure page synchronisation occurs even as a result of hash changes
		}
		else {
			_onDeeplink.dispatch( SWFAddress.getValue() );
		}
	}

	
	function handleChange() {

		// something in prev project for depeciating
		//if (hrefRelId == null && _isIn && currentContent!=null) currentContent.trigger(e.type, e);
		//hrefRelId = null;
		
		//if (e.cancelled) {  // some flag to cancel default behaviour in previous project..hmm.
		//	return;
		//}

		
		_onChange.dispatch();
		
		_fakeURLState = null; // flush away any temporary fake url state
		
		
		
		var fullValue = api.getValue();	
		//GaiaDebug.log(fullValue + ", "+_getSrcURL(History.getState().url) + ", "+ _pageHash[_getSrcURL(History.getState().url)].path );
		var path = fullValue.slice(1); 
		//alert(fullValue + ", "+_getSrcURL(History.getState().url));
		_lastValue = path;
		
		// TODO: remove trailing slashes for path??
		
		var validBranch =_pathHash[path] ? path :   _getValidBranch( path.split("/") );
		
	
		if ( validBranch  ) {  
			var canonicalDeeplink = validDL( path.slice(validBranch.length) );
			loadPageK( _pathHash[validBranch]  );
			
			
			if (html4) {
				_onDeeplink.dispatch( canonicalDeeplink );
			}
			else {  // html5 lcoked down
				_onDeeplink.dispatch( SWFAddress.getValue() );  
			}
		}
		else {  // always revert to landing page if invalid page found. (TODO: technically, could include 404 page as well)
			
			
			loadPageK( landingPage.path  );
			if (html4) _onDeeplink.dispatch( validDL(fullValue) );
			else _onDeeplink.dispatch( SWFAddress.getValue() );
		}
		
	}
	
	
	

	return this.api;  //!important for public api access!
})(this);