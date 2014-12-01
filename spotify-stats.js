/**
 * Simple script that fetches play statistics from last.fm and inserts them
 * into a local database.
 *
 * Created by tm on 01/12/14.
 * @author Thomas Malt <thomas@malt.no>
 */

var request = require('superagent');
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
    },
    lastfetch: 0
};

/**
 * Fetches the actual data from the api. Forwards the list of tracks to
 * handleresult.
 */
lastfm.doGetData = function() {
    request
        .get("http://ws.audioscrobbler.com/2.0/")
        .query(lastfm.options)
        .end(function(res) {
            console.log("status code:", res.status);
            console.log("headers:", res.headers);

            if (res.body.hasOwnProperty("error")) {
                console.log("got error:", res.body);
                lastfm.db.quit();
            }
            else if (
                res.body.recenttracks.hasOwnProperty('page') &&
                res.body.recenttracks.page == 0
            ) {
                console.log("Got empty result", res.body);
                lastfm.db.quit();
            }
            else {
                lastfm.handleResult(res.body.recenttracks.track);
            }
        });
};

/**
 * Fetches timestamp of last time we called the API from the
 * database.
 *
 * Passes on to doGetData.
 */
lastfm.doFetch = function() {
    lastfm.db.get('lastfetch', function (err, value) {
        console.log("lastfetch: ", value);
        if (value !== null) {
            lastfm.options.from = value;
            lastfm.lastfetch = value;
        }

        lastfm.doGetData();
    });
};

/**
 * Init function when called selectes the correct redis database and
 * calls doFetch.
 */
lastfm.run = function() {
    lastfm.db.select(3, function () {
        console.log("selecting DB 3");
        lastfm.doFetch();
    });
};

/**
 * Traverses the list of tracks from last.fm and inserts the essential data
 * into the redis database.
 *
 * @param tracks Array list of tracks from last.fm since last time I fetched.
 */
lastfm.handleResult = function(tracks) {
    console.log("Got tracks: ", tracks.length);

    tracks.reverse();

    tracks.forEach(function(item) {
        if (typeof item.date === 'undefined') return;

        var track = {
            timestamp: item.date.uts,
            date: (new Date(item.date.uts*1000)).toJSON(),
            artist: item.artist['#text'],
            title: item.name,
            album: item.album['#text']
        };

        if (track.timestamp > lastfm.lastfetch) {
            console.log("Track: ", track);
            lastfm.db.rpush("tracks", JSON.stringify(track));
            lastfm.lastfetch = track.timestamp;
            lastfm.db.set('lastfetch', lastfm.lastfetch);
        } else {
            console.log("got timestamp before lastfetch:", track.timestamp, lastfm.lastfetch);
        }
    });

    lastfm.db.quit();
}

// run the fetch
lastfm.run();