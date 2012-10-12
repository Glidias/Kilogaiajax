Kilogaiajax
===========

Kilogaiajax - Page/asset loading framework for full AJAX-based HTML sites
(requires JQuery and History.js). Also requires PHP (version 5) and a host server.


A lame attempt at creating a similar Gaia-Flash Framework style (http://www.gaiaframework.com)  ajax/php/html site. 
	
The premise? Declare your hierachical site structure in a site.xml (it's pages and it's page-specific assets such as CSS, scripts, etc. to preload). With the site.xml converted to JSON via PHP,  javascript can easily read it to create a full site structure. Page content is than dynamically loaded in under a html template.

What isn't available (or different from Gaia Flash framework)?
- No multiple page contents viewable at once (in HTML context, this isn't much use.). So, you are restricted to a single page content wrapper.
- No asset stacking. (for now, just duplicate asset dependencies per page node)
- No load-on-demand asset declarations. All assets are considered preloaded assets.
- No indexFirst  (in HTML context, this isn't much use)
- No flow customisation (ie. preload or cross flow options)
- No hijacking flow, but got event hook notifiers.

For public api methods, refer to "this.api = ...." line in site.js for available methods. Public methods are accessed using the Gaiajax.api object.

There's a lot of stuff not documented at the moment for the api, with varying use cases depending on whether your server supports Apache and Mod-rewrite.  More info coming up soon.