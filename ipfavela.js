var net = require("net");
var sys = require("sys");

function destSetup(client, dest) {
  dest.addListener('connect', function(data) {
    client.resume() });
  dest.addListener('data', function(data) {
    if (!client.write(data)) dest.pause() });
  dest.addListener('drain', function(data) {
    client.resume() });
  }

function forwarder(fromPort, fromIP, toPort, toIP, allowedIPs) {
  net.createServer(function(client) {
    if (allowedIPs.indexOf(client.remoteAddress) == -1) {
      client.end();
      sys.puts('Hacker alert! ' + client.remoteAddress);
      return
      }
    client.pause();
    dest = net.createConnection(toPort, toIP);
    client.addListener('connect', function() {
      destSetup(client, dest) });
    client.addListener('data', function(data) {
      if (!dest.write(data)) client.pause() });
    client.addListener('drain', function(data) {
      dest.resume() });
    }).listen(fromPort, fromIP);
  }

forwarder(2000, '10.0.0.114', 3306, '127.0.0.1',
  [ '10.0.0.114', '127.0.0.1' ]);


