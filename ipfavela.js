var net = require("net");
var sys = require("sys");
var dns = require("dns");

var sessions = {};
var ENCODING = 'binary';

function log(msg) {
  sys.puts(msg);
}

function logClient(client, msg) {
  var cid = client.fd;

  if (cid == null) {
    msg = 'CLI: ' + client.remoteAddress + ' (' + cid + ') -- ' + msg
  } else { 
    msg = 'CLI: ' + client.remoteAddress + ' (' + cid + ' ' + client.readyState + '/' + sessions[cid]['clientStatus'] +
    '/' + sessions[cid]['destStatus'] + ') -- ' + msg;
  }
  log(msg);
}

function destSetup(client, dest) {
  var cid = client.fd;
  var s = sessions[cid];

  dest.addListener('connect', function() {
    s['destStatus'] = 'R'; 
    s['clientStatus'] = 'R'; 
    client.resume();
    logClient(client, 'dest CONNECT');
  });

  dest.addListener('data', function(data) {
    // check if stream is writable!
    if (client.readyState != 'open')
      logClient(client, 'not ready? -> ' + client.readyState);
    if (client.write(data, ENCODING)) { 
      s['bytesOut'] += data.length;
    } else {
      s['destStatus'] = 'P'; 
      dest.pause();
    }
  });

  dest.addListener('drain', function() {
    s['clientStatus'] = 'R'; 
    if (client.readyState == 'open') {
      client.resume();
    }
  });

  dest.addListener('end', function() {
    logClient(client, 'dest END');
    dest.end(); 
  });

  dest.addListener('timeout', function() {
    logClient(client, 'dest TIMEOUT');
  });

  dest.addListener('error', function(exception) {
    logClient(client, 'dest ERROR: ' + exception) 
  });
}

function logSessions() {
  log('--- active sessions ---');
  for (i in sessions) {
    var s = sessions[i];
    log(s['client'].remoteAddress + ' (' + i + ' ' + s['client'].readyState + ' ' + s['clientStatus'] + '/' + 
      s['dest'].fd + ' ' + s['dest'].readyState + ' ' + s['destStatus'] + ') -- ' + 
      s['fromIP'] + ':' + s['fromPort'] + ' -> ' + 
      s['toIP']   + ':' + s['toPort']   +  
      ' (' + s['bytesIn'] + ' in/' + s['bytesOut'] + ' out)');
  }
}

/*
 * client statuses
 *   D - disconnected
 *   P - paused
 *   R - running
 *   C - closed
 */

function forwarder(fromPort, fromIP, toPort, toIP, allowedHosts) {
  var resolvedHosts = {};
  var allowedIPs = {};

  function updateAllowedIP(host) {
    dns.resolve4(host, function(err, addresses) {
      if (err) {
        log('host: ' + host);
        throw err;
      }

      /* remove previous resolved IPs */
      for (var i in resolvedHosts[host]) {
        delete allowedIPs[resolvedHosts[host][i]];
      }

      /* log('host: ' + host + ' -> ' + JSON.stringify(addresses)); */
      resolvedHosts[host] = addresses;

      for (var i in addresses) {
        allowedIPs[addresses[i]] = 1;
      }
      /* log('allowed IPs: ' + sys.inspect(allowedIPs)); */
    });
  }

  function updateAllowedIPs() {
    for (var i in allowedHosts) {
      updateAllowedIP(allowedHosts[i]);
    }
  }

  updateAllowedIPs();
  setInterval(updateAllowedIPs, 60000);

  net.createServer(function(client) {
    var cid = client.fd;

    if (allowedIPs[client.remoteAddress] != 1) {
      client.end();
      log('Hacker alert! ' + client.remoteAddress);
      return
    }

    client.setEncoding(ENCODING);
    client.pause();
    var dest = net.createConnection(toPort, toIP);
    dest.setEncoding(ENCODING);
    var s = sessions[cid] = { client: client, dest: dest,  
      fromPort: fromPort, fromIP: fromIP, toPort: toPort, toIP: toIP, 
      bytesIn: 0, bytesOut: 0,
      clientStatus: 'P', destStatus: 'D' };
    logClient(client, 'NEW');

    client.addListener('connect', function() {
      logClient(client, 'CONNECT');
      destSetup(client, dest);
    });

    client.addListener('data', function(data) {
      if (dest.write(data, ENCODING)) {
        s['bytesIn'] += data.length;
      } else {
        s['clientStatus'] = 'P'; 
        client.pause();
      } 
    });

    client.addListener('drain', function() {
      s['destStatus'] = 'R'; 
      dest.resume();
    });

    client.addListener('end', function() {
      s['clientStatus'] = 'C'; 
      s['destStatus'] = 'C'; 
      logClient(client, 'END');
      delete sessions[client.fd];
      dest.end();
      client.end();
    });

    client.addListener('timeout', function() {
      logClient(client, 'TIMEOUT');
    });

    client.addListener('error', function(exception) {
      log('ERROR: ' + exception + ' -- ' + sys.inspect(client));
    });
  }).listen(fromPort, fromIP);
}

setInterval(logSessions, 10000);

forwarder(27017, '1.2.3.4', 27017, '127.0.0.1',
  [ 'host1', 'host2', 'host3' ]);


