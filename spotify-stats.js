/**
 * Simple script that fetches play statistics from last.fm and inserts them
 * into a local database.
 *
 * Created by tm on 01/12/14.
 * @author Thomas Malt <thomas@malt.no>
 */

var request = require('request');
var redis   = require('redis');
var config  = require('./config');

var lastfm = {
    json: '',
    db: redis.createClient(config.redis.port, config.redis.host, config.redis.options),
    options: {
        method: "user.getrecenttracks",
        user: config.lastfm.user,
        api_key: config.lastfm.api_key,
        limit: 200,
        format: "json"
    }
};

lastfm.doGetData = function() {
    request.get({
        uri: "http://ws.audioscrobbler.com/2.0/",
        qs: lastfm.options

    }).on('response', function (res) {
        console.log("status: ", res.statusCode);
        console.log("response: ", res.headers);
    }).on('data', function (data) {
        lastfm.json += data;
    }).on('end', function () {
        var json = JSON.parse(lastfm.json);
        if (json.hasOwnProperty("error")) {
            console.log("got error:", json);
            lastfm.db.quit();
        }
        else if (json.recenttracks.hasOwnProperty('page') && json.recenttracks.page == 0) {
            console.log("Got empty result", json);
            lastfm.db.quit();
        }
        else {
            lastfm.handleResult(json.recenttracks.track);
        }
    });
};

lastfm.doFetch = function() {
    lastfm.db.get('lastfetch', function (err, value) {
        console.log("lastfetch: ", value);
        if (value !== null) {
            lastfm.options.from = value;
        }

        var now = (new Date()).setMilliseconds(0).getTime()/1000;
        if (now - value < 300) {
            console.log("Trying to run too soon. exiting");
            lastfm.db.quit();
            process.exit();
        }

        lastfm.doGetData();
    });
};

lastfm.run = function() {
    lastfm.db.select(3, function () {
        console.log("selecting DB 3");
        lastfm.doFetch();
    });
};


lastfm.handleResult = function(tracks) {
    console.log("Got tracks: ", tracks.length);

    var now = new Date();
    now.setMilliseconds(0);

    lastfm.db.set('lastfetch', (now.getTime()/1000));
    tracks.forEach(function(item) {
        var track = {
            timestamp: item.date.uts,
            date: (new Date(item.date.uts*1000)).toJSON(),
            artist: item.artist['#text'],
            title: item.name,
            album: item.album['#text']
        };
        console.log("Track: ", track);
        lastfm.db.lpush("tracks", JSON.stringify(track));
    });

    lastfm.db.quit();
}

lastfm.run();