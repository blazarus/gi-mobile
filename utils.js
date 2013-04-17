Object.defineProperty(global, '__stack', {
	get: function(){
		var orig = Error.prepareStackTrace;
		Error.prepareStackTrace = function(_, stack){ return stack; };
		var err = new Error;
		Error.captureStackTrace(err, arguments.callee.caller);
		var stack = err.stack;
		Error.prepareStackTrace = orig;
		return stack;
	}
});
Object.defineProperty(global, '__file', {
	get: function(){
		return __stack[1].getFileName().split('/').slice(-1)[0];
	}
});
Object.defineProperty(global, '__line', {
	get: function(){
		return __stack[1].getLineNumber();
	}
});
// alias console.log
var clog = function () {
	var argsList = [__file+":"+__line+":"];
	for (key in arguments) {
		argsList.push(arguments[key]);
	}
	console.log.apply(this, argsList);
};

exports.clog = clog