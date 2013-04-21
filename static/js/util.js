// javascript:debugger

var Utils = {};
/*
 * Inserts commas in a number
 * Takes either string or integer and returns string
 */
Utils.formatNum = function (num) {
	//Check that this is a valid integer
	num = parseInt(num, 10);

	if (isNaN(num)) {
		throw "Not a valid integer";
	}
	var isNeg = num < 0;

	num = String(num);
	if (isNeg) num = num.slice(1);

	if (num.length <= 3) {
		return isNeg ? "-" + num : num;
	}

	var newStr = "";

	for (var i = num.length; i > 0; i -= 3) {
		if (i-3 > 0) {
			newStr = "," + num.slice(i-3,i) + newStr;
		} else {
			newStr = num.slice(0, i) + newStr;
		}
	}
	return isNeg ? "-" + newStr : newStr;

};

/**
 * Wrap a url to intelligently deal with whether AJAX coming from 
 * mobile app or website.
 * @param  {string} url
 * @return {string}
 */
Utils.wrapUrl = function (url) {
	var host = GI_SERVER_URL ? GI_SERVER_URL : window.location.host;
	return host + url;
};
