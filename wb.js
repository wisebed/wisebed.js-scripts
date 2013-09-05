#!/usr/bin/env node

/*

If environment variable WB_TESTBED is set parameter -c is not necesarry but will
be read from WB_TESTBED. If --config|-c is given whatsoever the value will override
the value from WB_TESTBED. The same applies to the environment variable WB_RESERVATION,
enabling to omit the parameter --reservation|-r if set to the key of a reservation.

Every command will be executed on all reserved nodes if not specified differently.
You can specify a list of nodes with the -n|--nodes parameter, passing a
comma-separated list of node URNs to it. Alternatively, you can filter the list
of reserved nodes by either type (-t|--type) or sensor (-s|--sensor), eaching taking
a list of comma-separated arguments. E.g., if you invoke a command with
--type isense39,isense48 all sensor nodes of the given types will be selected for
the specific operation. You can combine both -t|--type and -s|--sensor to further
filter (e.g., in order to find all "isense39" nodes with temperature sensors).
In the command documentation below the expression NODES_FILTER refers to the
aformentioned posibilities to filter/select nodes.

Every command will print out some kind of result. The output is formatted as CSV per
default. So, if e.g., you reset a set the nodes urn:local:0x0001 and urn:local:0x0002,
the first fails and the second succeeds the output will show as
"urn:local:0x0001=SUCCESS,urn:local:0x0002=ERROR".

For most scripts the output of one script can be taken as input for another script.
This way you can chain calls, e.g. you can reset all nodes after flashing them by
running "wb reset `wb flash -t isense39`". You can limit the output to either
successful or unsuccesful nodes by passing the -o|--output parameter. E.g., if you
only want to reset the nodes that were successfully flashed you will have to modify
the above command to "wb reset `wb flash -t isense39 -o success`" or "-o error" in
the other case.

wb nodes                 WB_TESTBED                [NODES_FILTER] [-v]                    - lists available testbed nodes. If -v is given sensor node details are also printed.
wb reserved-nodes        WB_TESTBED WB_RESERVATION [NODES_FILTER] [-v]                    - lists resered nodes. If -v is given sensor node details are also printed.
wb reserve               WB_TESTBED                [NODES_FILTER] -D [-O]                 - tries to reserve the given/all nodes for duration "-D|--duration" starting from "-O|--ofset"
wb listen                WB_TESTBED WB_RESERVATION [NODES_FILTER]                         - listens to sensor node outputs
wb send                  WB_TESTBED WB_RESERVATION [NODES_FILTER] [-o] [-m bin|ascii] MSG - sends the message MSG. MSG can either be a binary string, specified as comma-separated list of hex, decimal and binary values or an ascii string
wb reset                 WB_TESTBED WB_RESERVATION [NODES_FILTER]                         - resets nodes
wb flash                 WB_TESTBED WB_RESERVATION [NODES_FILTER] img.bin                 - flashes nodes with provided image
wb alive                 WB_TESTBED                [NODES_FILTER]                         - checks if nodes are alive by calling SM.areNodesAlive()
wb ping                  WB_TESTBED WB_RESERVATION [NODES_FILTER]                         - checks if nodes are alive by calling WSN.areNodesAlive()
wb set-channel-handlers  WB_TESTBED WB_RESERVATION [NODES_FILTER] h1,h2                   - set channel pipeline
wb get-channel-handlers  WB_TESTBED WB_RESERVATION [NODES_FILTER]                         - get current channel pipeline
wb list-channel-handlers WB_TESTBED                                                       - list supported channel handlers
wb enable-vlink          WB_TESTBED WB_RESERVATION                N1=N2([,N3=N4])*        - sets virtual links from node N1 to node N2 and from each N3 to the corresponding N4 if given
wb disable-vlink         WB_TESTBED WB_RESERVATION                N1=N2([,N3=N4])*        - disables the virtual link from node N1 to node N2 and from each N3 to the corresponding N4 if given
wb wiseml                WB_TESTBED                                                       - prints the testbeds WiseML file
wb reserved-wiseml       WB_TESTBED WB_RESERVATION                                        - prints the WiseML file, constained to the reserved nodes

*/

function readConfigFromFile(filename) {
  var fs = require('fs');
  if (!fs.existsSync(filename)) {
    console.log("Configuration file '" + filename + "' does not exist!");
    process.exit(1);
  }
  var file = fs.readFileSync(filename);
  var config = JSON.parse(file);
  if (!config.rest_api_url) {
    console.log("Parameter 'rest_api_url' is missing in configuration file!");
    process.exit(1);
  }
  if (!config.username) {
    console.log("Parameter 'username' is missing in configuration file!");
    process.exit(1);
  }
  if (!config.password) {
    console.log("Parameter 'password' is missing in configuration file!");
    process.exit(1);
  }
  return config;
}

var app = require('commander');
var config;

app
  .version('1.0-alpha')
  .option('-c, --config', 'Path to config file containing testbed configuration')
  .option('-H, --helpConfig', 'Print out help about the configuration file')
  .option('-h, --help', 'Print this help dialog')
  .parse(process.argv);

if (app.h) {
  console.log(app.usage()); process.exit()
};

if (app.c) {
  config = readConfigFromFile(app.c);
} else if (process.env.WB_TESTBED) {
  config = readConfigFromFile(process.env.WB_TESTBED);
} else {
  console.log("Application parameter '-c' ('--config') is missing!");
  process.exit(1);
}

console.log('config', config);
