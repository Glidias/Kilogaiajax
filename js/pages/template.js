/**
 * @author Glidias
 */
 // NOTE: All methods handlers are optional, and can be commented away if you wish.
 
  // "gaiaReady" is always called when page has been added to contentWrapper just before transitioning in
gaiaReady = function() { 
	
	// Initialise whatever stuff required here..

	/**  
	*  Transition in handler
	*  @param callback	The callback method to execute to notify transition has completed.
	*  @param content	The jQuery page's contents (ie. it's child divs) under contentWrapper
	*/
	Gaiajax.api.setGaiaTransitionIn(function(callback, content){
		
		// comment this away if you wish to use your own custom transition code for page
		Gaiajax.api.getDefaultTransitionIn()(callback,content);
	});
	
	/**
	*  Transition out handler
	*/
	Gaiajax.api.setGaiaTransitionOut(function(callback, content){
		
		// comment this away if you wish to use your own custom transition code for page
		Gaiajax.api.getDefaultTransitionOut()(callback,content);
	});
	

	/**
	* Transition in complete handler
	*/
	Gaiajax.api.setGaiaTransitionInComplete(function(content){
		
	});
	
		/**
	* Transition out complete handler
	*/
	Gaiajax.api.setGaiaTransitionOutComplete(function(content){
		
	});
}