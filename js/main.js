/**
 * Main document class code
 * @author Glidias
 */
 
(function() {
	
	// CUSTOM DEFAULT TRANSITION IN/OUT METHOD DECLRATIONS
	function defaultTransitionIn(callback, content) {
		content.css("opacity", 0);
		content.stop().animate({opacity:1}, {duration:600}).promise().done(callback);
		
	}
	function defaultTransitionOut(callback, content) {
		content.stop().animate({opacity:0}, {duration:600}).promise().done(callback);
	
	}	
	Gaiajax.api.setDefaultTransitionIn(defaultTransitionIn);
	Gaiajax.api.setDefaultTransitionOut(defaultTransitionOut);
	
	
	
	//GLOBAL NAVIGATION
	var _myNavLinks = $("#nav");
	var _myNavLinksA = $("#nav a"); // the individual links within nav holder
	var _isHomeOut;

	function onAfterGoto() {	
		var src;	
		var paths = Gaiajax.api.getValidBranches(Gaiajax.api.getTargetPage().path);

		var i = paths.length;
		_myNavLinksA.removeClass("selected");
		while(--i > -1) {
			src = Gaiajax.api.getPage(paths[i]).src;
			_myNavLinks.find('a[href="'+src+'"]').addClass("selected");
		}
	}
	Gaiajax.api.onAfterGoto.add(onAfterGoto);
	onAfterGoto();
	
})();