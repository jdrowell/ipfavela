var net  = require("net");
var sys  = require("sys");
var dns  = require("dns");
var fs   = require("fs");
var yaml = require("yaml.js");

var sessions = {};
var ENCODING = 'binary';

function log(msg) {
  sys.puts(msg);
}

function loadConfig() {
  fs.open('ipfavela.yml', 'r', function(err, fd) {
    
  });
}

function logClient(client, msg) {
  var cid = client.fd;

  if (cid == null) {
    msg = 'CLI: ' + client.remoteAddress + ' (' + cid + ') -- ' + msg
  } else { 
    msg = 'CLI: ' + client.remoteAddress + ' (' + cid + ' ' + client.readyState +
      ') -- ' + msg;
  }
  log(msg);
}

function destSetup(client, dest) {
  var cid = client.fd;
  var s = sessions[cid];

  dest.addListener('connect', function() {
    client.resume();
    logClient(client, 'dest CONNECT');
  });

  dest.addListener('data', function(data) {
    // check if stream is writable!
    if (client.readyState != 'open') {
      return;
    }
    if (client.write(data, ENCODING)) { 
      s['bytesOut'] += data.length;
    } else {
      dest.pause();
    }
  });

  dest.addListener('drain', function() {
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
    log(s['client'].remoteAddress + ' (' + i + ' ' + s['client'].readyState + ' ' + '/' + 
      s['dest'].fd + ' ' + s['dest'].readyState + ') -- ' + 
      s['fromIP'] + ':' + s['fromPort'] + ' -> ' + 
      s['toIP']   + ':' + s['toPort']   +  
      ' (' + s['bytesIn'] + ' in/' + s['bytesOut'] + ' out)');
  }
}

function forwarder(fromPort, fromIP, toPort, toIP, allowedHosts) {
  var resolvedHosts = {};
  var allowedIPs = {};

  function updateAllowedIP(host) {
    dns.resolve4(host, function(err, addresses) {
      if (err) {
        log('Error resolving host: ' + host);
        /* don't throw, we're going to try this again anyway */
        return;
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
      bytesIn: 0, bytesOut: 0 };
    logClient(client, 'NEW');

    client.addListener('connect', function() {
      logClient(client, 'CONNECT');
      destSetup(client, dest);
    });

    client.addListener('data', function(data) {
      // check if stream is writable!
      if (dest.readyState != 'open') {
        return;
      }
      if (dest.write(data, ENCODING)) {
        s['bytesIn'] += data.length;
      } else {
        client.pause();
      } 
    });

    client.addListener('drain', function() {
      dest.resume();
    });

    client.addListener('end', function() {
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

forwarder(27017, '69.163.148.171', 27017, '127.0.0.1',
  [ 'nosql-01.eyb.com.br', 'nosql-02.eyb.com.br', 'nosql-03.eyb.com.br', 'nosql-04.eyb.com.br', 'yoda.gotdns.org' ]);

