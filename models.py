import datetime
from flask import url_for
from app import db

class JSON_Mixin(object):
    def toJSON(self):
        d = dict(self.__dict__['_data'])

        # Get rid of None key
        d.pop(None, None) 

        def serialize_props(elem):
            if hasattr(elem, "toJSON"):
                return elem.toJSON()
            if isinstance(elem, datetime.datetime):
                return elem.toordinal()
            if isinstance(elem, list):
                # Recursive for list elements
                return [serialize_props(el) for el in elem]
            return elem
        
        for key in d:
            # pass in the property of the object, not of __dict__
            d[key] = serialize_props(self[key])

        d['id'] = str(self.id)

        return d


class Location(db.Document, JSON_Mixin):
    name = db.StringField(max_length=255, required=True, unique=True)

    @staticmethod
    def add_locations():
        loc_names = [
            "e14-474-1",
            "e15-468-1A",
            "e14-274-1",
            "NONE"
        ]

        
        for name in loc_names:
            try:
                loc = Location(name=name)
                loc.save() 
            except:
                print name, "has already been added to the DB"
                continue

    def __str__(self):
        return self.name

    @staticmethod
    def delete_all():
        for loc in Location.objects.all():
            Location.delete(loc)
       


class User(db.Document, JSON_Mixin):
    username = db.StringField(max_length=255, required=True, unique=True)
    last_loc = db.ReferenceField(Location, dbref=False)

    meta = {
        'allow_inheritance': True
    }

    def __str__(self):
        return self.username

    @staticmethod
    def delete_all():
        for user in User.objects.all():
            User.delete(user)


class Message(db.Document, JSON_Mixin):
    created_at = db.DateTimeField(default=datetime.datetime.now, required=True)
    subject = db.StringField(max_length=255, required=True)
    body = db.StringField(required=True)
    sender = db.ReferenceField(User, dbref=False, required=True)
    to = db.ListField(db.EmbeddedDocumentField('User'), required=True)
    location = db.ListField(db.EmbeddedDocumentField('Location'), required=True)

    meta = {
        'allow_inheritance': True,
        'indexes': ['-created_at'],
        'ordering': ['-created_at']
    }

    def __str__(self):
        return "from %s, to %s" % (self.sender, self.to)

    @staticmethod
    def delete_all():
        for user in User.objects.all():
            User.delete(user)

    @staticmethod
    def get_all_for_user(user):
        """
        user -> either a User object or a valid username string
        """
        if isinstance(user, str):
            try:
                user = User.objects.get(username=user)
            except Exception, e:
                print "Caught exception:", e
                return None


        res = Message.objects.filter(to=user)

        return res



def test1():
    Location.add_locations()
    locs = Location.objects.all()
    print [loc.name for loc in locs]

    users = [
        "blazarus",
        "havasi",
        "jon"
    ]

    for user in users:
            try:
                u = User(username=user)
                u.save() 
                print "Saved user", user
            except:
                print user, "has already been added to the DB"
                continue
    users = User.objects.all()
    print [user.username for user in users]

    blaz = User.objects.get(username="blazarus")
    cah = User.objects.get(username="havasi")
    jon = User.objects.get(username="jon")

    m = Message(
        subject="Another message",
        body="Hey Brett and Jon, it's Catherine!",
        sender=cah,
        to=[blaz, jon],
        location=[Location.objects[0]]
    )
    m.save()

    print Message.objects.all()

def test_get_all_for_user():
    print "Messages for 'havasi':", Message.get_all_for_user("havasi")
    print "Messages for 'blazarus':", Message.get_all_for_user("blazarus")
    print "Messages for User havasi:", Message.get_all_for_user(User.objects.get(username='havasi'))
    print "Messages for new User:", Message.get_all_for_user(User(username='not real'))
    print "Messages for non existent username:", Message.get_all_for_user("not real")

if __name__ == '__main__':
    test_get_all_for_user()
