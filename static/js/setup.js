/*
 * Set up the globally accessible App object
 */

window.App = {
	Models: {},
	Collections: {},
	Routers: {},
	Views: {},
	Templates: {
		"login": null,
		"messageList": null,
		"message": null,
		"postMessage": null
	},
	User: null, // The logged in user (null when not logged in)
	options: {
		DUMMY_LOC: false // Use fake location for testing
	},
	init: function(){
		App.router = new App.Routers.main();
		Backbone.history.start({pushState: true});
	}	
};