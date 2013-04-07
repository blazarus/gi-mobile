// javascript:debugger

$( function () {

	checkParams();

	// Make sure templates are loaded before running main logic
	// Check if templates have loaded every ten ms
	// blockUntilTrue(checkTemplates, window.App.init, 10);
	window.App.init();
});

var checkParams = function () {
	var params = location.href.split("?");
	console.log(params)
	if (params[1]) {
		params = params[1].split("&");

		for (var i=0; i < params.length; i++) {
		psplit = params[i].split("=");
		switch (psplit[0]) {
			case "dummyloc":
				if (psplit[1].toLowerCase() == 'true') {
					App.options.DUMMY_LOC = true;
				}
				break;
			}
		}
	}
}

// for (tmpl in window.App.Templates) {
// 	(function (tmpl) {
// 		// Expects templates to be accessible from /templates/<tmpl>
// 		$.get('/templates/' + tmpl + '.html', function (data) {
// 			window.App.Templates[tmpl] = data;
// 		});
// 	})(tmpl); // Pass tmpl in here to seal in value when callback is run
// }

// var checkTemplates = function () {
// 	// Checks if all the templates have been loaded
// 	for (tmpl in window.App.Templates) {
// 		if (!window.App.Templates[tmpl]) return false;
// 	}
// 	return true;
// }

// var blockUntilTrue = function (check, func, sleeptime) {
// 	/*
// 	 * will try check() every <sleeptime> ms
// 	 * if it is true, it will break this loop and run func
// 	 */
// 	if (check()) {
// 		func();
// 	} else {
// 		setTimeout(function () {
// 			blockUntilTrue(check, func, sleeptime);
// 		}, sleeptime);
// 	}
// }