from flask import *
from flask.ext.mongoengine import MongoEngine
from contextlib import closing
import json
import pdb
from util import *

app = Flask(__name__)
app.config["MONGODB_SETTINGS"] = {'DB': "gi_companion"}
app.config["SECRET_KEY"] = '[X\xa7/\xa0\x87\xe5?D,N\xf1N}c\x06\x91\xa6%\xd8\x87\x1b0\xda'

db = MongoEngine(app)
from models import *

app.secret_key = '\n\x0c\x86~E\\\xfe\xe1\xc5m\xd1#\x90\xfaQD\x1d\xc6]=\xf5\rd\xa1'

# def connect_db():
#     return sqlite3.connect(DATABASE)

@app.errorhandler(404)
def page_not_found(e):
	return render_template('404.html'), 404



def profile_function(f):
	def inner(*args):
		start = datetime.now()
		result = f(*args)
		end = datetime.now()
		print "Function " + str(f.__name__) + " took " + str(end-start) + " to complete"
		return result
	return inner

# @app.before_request
# def before_request():    
#     g.db = connect_db()

# @app.after_request
# def after_request(response):
#     g.db.close()
#     return response

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def index(path):
	
	return render_template('index.html')
	# if 'username' in session:
	# 	return render_template('index.html')
	# else:
	# 	return redirect(url_for('login'))

@app.route('/templates/<tmpl>')
def get_tmpl(tmpl):
	if tmpl == 'postMessage.html':
		locs = [loc.name for loc in Location.objects.all()]
		print "rendering postMessage template with locs"
		return render_template(tmpl, locs=locs)
	print "rendering template:", tmpl
	return render_template(tmpl)

@app.route('/login', methods=['POST'])
def login():
	if request.method == 'GET':
		"""
		simply load the login.html page
		"""
		return render_template('login.html')
	else:
		"""
		request was a HTTP POST, so this is validating user credentials
		and starting a session if valid.

		This is an AJAX request, so the client is responsible for redirecting on success
		"""
		print "The request form:", request.form

		if 'webcode' in request.form and request.form['webcode'] != '':
			uname = get_username(request.form['webcode'])
			if uname != None:
				session['username'] = uname
				return json.dumps({'status': 'ok', 'username': session['username']})
			else:  
				msg = 'Not a valid webcode'
				return json.dumps({'status': 'error', 'msg': msg})
		elif 'username' in request.form and request.form['username'] != '':
			if validate_username(request.form['username']) != None:
				session['username'] = request.form['username']
				return json.dumps({'status': 'ok', 'username': session['username']})
			else:
				msg = 'Not a valid username'
				return json.dumps({'status': 'error', 'msg': msg})
		else:
			msg = 'Need to submit either a webcode or username'
			return json.dumps({'status': 'error', 'msg': msg})

@app.route('/checklogin')
def checklogin():
	if 'username' in session:
		return json.dumps({'status': 'ok', 'username': session['username']})
	return json.dumps({'status': 'no_login'})
	

@app.route('/logout')
def logout():
	# remove the username from the session if it's there
	session.pop('username', None)
	return redirect(url_for('login'))

def get_username(webcode):
	"""
	Get username from the webcode found on the RFID badges.
	"""
	return get_from_url('username', "http://data.media.mit.edu/spm/contacts/json?web_code=%s" % (webcode))

def validate_username(uname):
	"""
	Validate that this is a legit username
	"""
	return get_from_url('profile', "http://data.media.mit.edu/spm/contacts/json?username=%s" % (uname))

def get_last_location(username):
	events = get_from_url('events', 'http://gi-ego.media.mit.edu/%s/events/1' % username)
	if len(events) == 0: 
		return None
	else:
		event = events[0]
		r = event.get('readerid')
		s = event.get('screenid')
		print "readerID:",r
		print "screenID:", s
		return r



@app.route('/dummyloc')
def dummy_location():
	return render_template('dummy_location.html')

@app.route('/dummyloc/update', methods=['POST'])
def update_dummyloc():
	loc = request.form['loc']
	session['dummy_loc'] = loc
	print "current location:", session['dummy_loc']
	return json.dumps({'status': 'ok'})

@app.route('/lastloc')
def get_curr_loc():
	print "request:", request.args

	if 'username' not in session:
		return json.dumps({'status': 'error', 'msg': 'Not logged in'})
	loc = None
	if 'dummy_loc' in request.args and request.args['dummy_loc'] == 'true':
		if 'dummy_loc' in session:
			loc = session['dummy_loc']
			print "Using dummy location:", loc
	else:
		loc = get_last_location(session['username'])

	return json.dumps({'status': 'ok', 'loc': loc})

@app.route('/messages/post', methods=['POST'])
def post_message():
	if request.method == 'GET':
		"""
		Load post_message.html
		"""
		locs = [loc.name for loc in Location.objects.all()]
		return render_template('postMessage.html', locs=locs)
	else:
		"""
		request was a HTTP POST, so this is validating user credentials
		and starting a session if valid.

		This is an AJAX request, so the client is responsible for redirecting on success
		"""
		try:
			print "The request form:", request.form

			print session['username']
			sender = User.objects.get(username=session['username'])
			to = User.objects.get(username=request.form['send-to'])
			loc = Location.objects.get(name=request.form['loc'])

			msg = Message(
				subject=request.form['subject'],
				body=request.form['body'],
				sender=sender,
				to=[to],
				location=[loc]
			)
			msg.save()

		except Exception, e:
			print "Caught exception:", e
		return json.dumps({'status': 'ok'})

@app.route('/messages')
def get_messages():
	"""
	Retrieves messages and returns them in json format
	"""
	try:
		print "Getting messages for", session['username']

		msgs = Message.get_all_for_user('havasi')
		print "Found %d messages" % (len(msgs))

		if len(msgs) == 0:
			return json.dumps({'status': 'error', 'messages': None})
		for msg in msgs:
			print msg.location
			print msg.toJSON()
			print
		print
		print
		jsono = [msg.toJSON() for msg in msgs]
		
		for i in range(len(jsono)):
			print "%d: %s" %(i, jsono[i])

		return json.dumps({'status': 'ok', 'messages': jsono})
	except Exception, e:
		print "Caught exception:", e
		return json.dumps({'status': "error"})

@app.route('/tmpl/message')
def message_template():
	return render_template('message.html')



if __name__ == '__main__':
	app.run(debug=True, host='0.0.0.0')

