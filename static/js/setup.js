/*
 * Set up the globally accessible App object
 */

window.App = {
	EventDispatcher: {},
	Models: {},
	Collections: {},
	Routers: {},
	Views: {},
	Templates: {
		"login": null,
		"messageList": null,
		"message": null,
		"postMessage": null,
		"locate": null,
		"locateListElem": null
	},
	User: null, // The logged in user (null when not logged in)
	options: {
		DUMMY_LOC: false // Use fake location for testing
	},
	init: function(){
		App.EventDispatcher = _.clone(Backbone.Events);
		App.router = new App.Routers.main();
		Backbone.history.start({pushState: true});
	}	
};