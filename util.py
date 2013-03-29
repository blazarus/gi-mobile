import urllib, urllib2, json
import traceback

def get_from_url(key, url):
    try:
        theurl = urllib2.urlopen(url).read()
        stream = json.loads(theurl)
        if stream.get("error") or key not in stream:
            print "get from url error!", "key:", key, "url:", url
            return None
        return stream[key]
    except urllib2.HTTPError:
        print "get from url error!", "key:", key, "url:", url
        print "traceback", traceback.print_stack()
        return None