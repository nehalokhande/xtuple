/*jshint node:true, indent:2, curly:false, eqeqeq:true, immed:true, latedef:true, newcap:true, noarg:true,
regexp:true, undef:true, strict:true, trailing:true, white:true */
/*global X:true, Backbone:true, _:true, XM:true, XT:true*/

var _ = require('underscore'),
  async = require('async'),
  buildDatabase = require("./build_database").buildDatabase,
  buildClient = require("./build_client").buildClient,
  exec = require('child_process').exec,
  fs = require('fs'),
  path = require('path'),
  pg = require('pg'),
  winston = require('winston');

(function () {
  "use strict";

  var creds,
    buildAll = function (specs, creds) {
      buildDatabase(specs, creds, function (databaseErr, databaseRes) {
        //console.log(typeof databaseErr);
        if (databaseErr) {
          console.log("Database error. Not bothering to build the client");
          return;
        }
        console.log("Success!");
        //buildClient(specs, creds, function (clientErr, clientRes) {
        //  if (clientErr) {
        //    console.log("Client build failed");
        //    return;
        //  }
        //  console.log("All is good!");
        //});
      });
    };

  //
  // Looks in a database to see which extensions are registered.
  // API conforms to async expectations.
  // Also tacks on the core directory.
  //
  var getRegisteredExtensions = function (database, callback) {
    creds.database = database;
    var client = new pg.Client(creds);
    client.connect();

    //queries are queued and executed one after another once the connection becomes available
    var result = client.query("SELECT * FROM xt.ext ORDER BY ext_load_order", function (err, res) {
      if (err) {
        // xt.ext probably doesn't exist, because this is probably a brand-new DB.
        // No problem! Give them the core extensions.
        // TODO: we could get these extensions dynamically by looking at the filesystem.
        res = {
          rows: [
            { ext_location: '/core-extensions', ext_name: 'crm' },
            { ext_location: '/core-extensions', ext_name: 'sales' },
            { ext_location: '/core-extensions', ext_name: 'project' }
          ]
        };
      }

      var paths = _.map(res.rows, function (row) {
        var location = row.ext_location,
          name = row.ext_name,
          extPath;

        if (location === '/core-extensions') {
          extPath = path.join(__dirname, "/../../enyo-client/extensions/source/", name);
        } else if (location === '/xtuple-extensions') {
          extPath = path.join(__dirname, "../../../xtuple-extensions/source", name);
        } else if (location === '/private-extensions') {
          extPath = path.join(__dirname, "../../../private-extensions/source", name);
        }
        return extPath;
      }),
        returnObj;

      client.end();

      paths.unshift(path.join(__dirname, "../../enyo-client")); // core path
      paths.unshift(path.join(__dirname, "../../lib/orm")); // lib path
      returnObj = {
        extensions: paths,
        database: database
      };
      callback(null, returnObj);
    });

  };

  exports.build = function (database, extension) {
    var buildSpecs = {},
      databases = [],
      config = require(path.join(__dirname, "../../node-datasource/config.js"));

    creds = config.databaseServer;
    creds.host = creds.hostname; // adapt our lingo to node-postgres lingo
    creds.username = creds.user; // adapt our lingo to orm installer lingo

    if (database) {
      // the user has specified a particular database
      // regex: remove trailing slash if present
      databases.push(database);
    } else {
      // build all the databases in node-datasource/config.js
      databases = config.datasource.databases;
    }

    if (extension) {
      // extensions are assumed to be specified relative to the cwd
      extension = path.join(process.cwd(), extension);
      buildSpecs = _.map(databases, function (database) {
        // the user has specified an extension to build
        return {
          database: database,
          extensions: [extension]
        };
      });
      // synchronous...
      buildAll(buildSpecs, creds);

    } else {
      // build all registered extensions for the database
      async.map(databases, getRegisteredExtensions, function (err, results) {
        // asynchronous...
        buildAll(results, creds);
      });
    }
  };

}());

