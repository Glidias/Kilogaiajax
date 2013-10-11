Kilogaiajax
===========

Kilogaiajax - Page/asset preloading framework for full AJAX-based SEO-friendly HTML sites
(uses JQuery [ http://www.jquery.com ], SWFAddress [ http://www.asual.com/swfaddress/ ] and History.js [ http://github.com/balupton/History.js/ ].
	
Also prefably requires a host server supporting PHP (version 5) for site development. (note: For deployment, PHP support can be optional.).
	
A lame attempt at creating a similar Gaia-Flash Framework style [ http://www.gaiaflashframework.com ]  ajax/php/html site. 
	
The premise? Declare your hierachical site structure in a site.xml (it's pages and it's page-specific assets such as CSS, scripts, images, etc. to preload). With the site.xml converted to JSON via a PHP script,  javascript can easily read it to create a full site structure. Page content is than dynamically loaded in under a html template.

For public api methods, refer to "this.api = ...." line in site.js for available methods. Public methods are accessed using the Gaiajax.api object.

There's a lot of stuff not documented at the moment for the api, with varying use cases depending on whether your server supports Apache and Mod-rewrite.  More info/examples coming up soon. Please view https://github.com/Glidias/Kilogaiajax/wiki for more information.
