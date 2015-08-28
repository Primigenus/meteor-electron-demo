Messages = new Mongo.Collection("messages");

FlowRouter.subscriptions = function() {
  this.register("users", Meteor.subscribe("users"));
  this.register("userFriends", Meteor.subscribe("userFriends"));
};

FlowRouter.route("/", {
  name: "friendList",
  subscriptions: function() {
    this.register("lastMessages", Meteor.subscribe("lastMessages"));
  },
  action: function() {
    BlazeLayout.render("window", {
      name: "friendList"
    });
  }
});

FlowRouter.route("/chat/:userId", {
  name: "messageWindow",
  subscriptions: function(params) {
    this.register("friend", Meteor.subscribe("chatWithFriend", params.userId));
  },
  action: function(params) {
    BlazeLayout.render("window", {
      name: "messageWindow"
    });
  }
});

if (Meteor.isClient) {

  if (Electron.isDesktop()) {
    var remote = window.require("remote");
    var BrowserWindow = remote.require("browser-window");
  }

  Accounts.ui.config({
    passwordSignupFields: "USERNAME_ONLY"
  });

  Template.registerHelper("isDesktop", function() {
    return Electron.isDesktop();
  });

  Template.friendList.helpers({
    friend: function() {
      if (!Meteor.user()) return;
      return _.map(Meteor.user().friends, function(f) {
        return Meteor.users.findOne(f);
      });
    },
    lastMessage: function() {
      var message = Messages.findOne({
        $or: [{senderId: this._id}, {receiverId: this._id}]
      }, {sort: {date: -1}, limit: 1});
      if (message)
        return message.text.substring(0, 15) + "...";
    },
    lastMessageDate: function() {
      var message = Messages.findOne({
        $or: [{senderId: this._id}, {receiverId: this._id}]
      }, {sort: {date: -1}, limit: 1});
      if (message)
        return moment(message.date).fromNow();
    }
  });

  Template.friendList.events({
    "click li": function() {
      var messageWindow = new BrowserWindow({
        width: 640,
        height: 480
      });
      var path = window.location.origin +
                 FlowRouter.path("messageWindow", {userId: this._id});
      messageWindow.loadUrl(path);
    }
  });

  Template.messageWindow.helpers({
    message: function() {
      return Messages.find({}, {sort: {date: 1}});
    },
    username: function() {
      var user = Meteor.users.findOne(this.senderId);
      if (user)
        return user.username;
    },
    friendName: function() {
      var user = Meteor.users.findOne(FlowRouter.getParam("userId"));
      if (user)
        return user.username;
    }
  });

  Template.messageWindow.events({
    "keyup input": function(evt) {
      var $input = $(evt.target);
      if (evt.keyCode === 13) {
        Messages.insert({
          senderId: Meteor.userId(),
          receiverId: FlowRouter.getParam("userId"),
          text: $input.val(),
          date: new Date()
        });
        $input.val("");
        $input.focus();
        evt.preventDefault();
      }
    }
  });

}

if (Meteor.isServer) {

  Meteor.publish("users", function() {
    return Meteor.users.find({}, {fields: {
      username: 1,
      friends: 1
    }});
  });

  Meteor.publish("userFriends", function() {
    var user = Meteor.users.findOne({_id: this.userId});
    if (user && _.isArray(user.friends)) {
      return Meteor.users.find({_id: {$in: user.friends}}, {fields: {
        username: 1
      }});
    }
  });

  Meteor.publish("chatWithFriend", function(userId) {
    return Messages.find({
      $or: [
        {senderId: userId, receiverId: this.userId}, // from them to me
        {receiverId: userId, senderId: this.userId}  // from me to them
      ]
    }, {
      sort: {date: -1}
    });
  });

  Meteor.publish("lastMessages", function() {
    return Messages.find({
      $or: [
        {receiverId: this.userId},
        {senderId: this.userId}
      ]
    }, {sort: {date: -1}, limit: 1});
  });

  Meteor.methods({
    createUsers: function() {
      Meteor.users.remove({});
      Messages.remove({});
      var usernames = ["rahul", "mike", "alice", "robert", "laurie", "jessica"];
      _.each(usernames, function(name) {
        var userId = Accounts.createUser({
          username: name,
          password: "herpderp"
        });
        Meteor.call("setupFriends", userId);
      });
    },
    setupFriends: function(userId) {
      var allUsers = Meteor.users.find().fetch();
      _.each(userId ? [userId] : allUsers, function(u) {
        Meteor.users.update(u._id, {$set: {
          friends: _.without(_.pluck(allUsers, "_id"), u._id)
        }});
      });
    }
  });

}
