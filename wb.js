#!/usr/bin/env node

/*

###########################################################################################
WARNING: THIS HERE IS NOT DOCUMENTATION BUT THE ORIGINAL SPECIFICATION / IDEAS COLLECTION.
USAGE DOCUMENTATION WILL BE GIVEN BY CALLING "wb.js --help"
###########################################################################################

If environment variable WB_TESTBED is set parameter -c is not necesarry but will
be read from WB_TESTBED. If --config|-c is given whatsoever the value will override
the value from WB_TESTBED. The same commanderlies to the environment variable WB_RESERVATION,
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

Some commands take time ranges as arguments. A time range can either be specified by
passing a tuple of -d|--duration and -o|--offset (where offset is optional, 0 is default)
or a tuple of -f|--from and -u|--until. Time ranges options are denoted with TIME_RANGE
below. 

######## DONE ########
wb nodes                 WB_TESTBED                [NODES_FILTER] [-d|--details]                   - lists available testbed nodes. If -d is given sensor node details are also printed.
wb reserved-nodes        WB_TESTBED WB_RESERVATION [NODES_FILTER] [-v|--verbose]                   - lists resered nodes. If -v is given sensor node details are also printed.
wb make-reservation      WB_TESTBED                [NODES_FILTER] TIME_RANGE                       - tries to reserve the given/all nodes for duration "-D|--duration" starting from "-O|--ofset"
wb list-reservations     WB_TESTBED                               [TIME_RANGE] [-a|--all]          - lists personal reservations in timespan (or all reservations if -a|--all is given)
wb listen                WB_TESTBED WB_RESERVATION [NODES_FILTER]                                  - listens to sensor node outputs
wb flash                 WB_TESTBED WB_RESERVATION [NODES_FILTER] img.bin                          - flashes nodes with provided image
wb reset                 WB_TESTBED WB_RESERVATION [NODES_FILTER]                                  - resets nodes
wb alive                 WB_TESTBED                [NODES_FILTER]                                  - checks if nodes are alive by calling areNodesAlive()
wb wiseml                WB_TESTBED                                                                - prints the testbeds WiseML file

######## TODO ########
wb send                  WB_TESTBED WB_RESERVATION [NODES_FILTER] [-m bin|ascii] MSG               - sends the message MSG. MSG can either be a binary string, specified as comma-separated list of hex, decimal and binary values or an ascii string
wb del-reservation       WB_TESTBED WB_RESERVATION                                                 - deletes the given reservation
wb set-channel-handlers  WB_TESTBED WB_RESERVATION [NODES_FILTER] h1,h2                            - set channel pipeline
wb get-channel-handlers  WB_TESTBED WB_RESERVATION [NODES_FILTER]                                  - get current channel pipeline
wb list-channel-handlers WB_TESTBED                                                                - list supported channel handlers
wb enable-vlink          WB_TESTBED WB_RESERVATION                N1=N2([,N3=N4])*                 - sets virtual links from node N1 to node N2 and from each N3 to the corresponding N4 if given
wb disable-vlink         WB_TESTBED WB_RESERVATION                N1=N2([,N3=N4])*                 - disables the virtual link from node N1 to node N2 and from each N3 to the corresponding N4 if given
wb reserved-wiseml       WB_TESTBED WB_RESERVATION                                                 - prints the WiseML file, constained to the reserved nodes

 */

function readConfigOrExit(filename) {

	function readConfigFromFile(filename) {
		var fs = require('fs');
		if (!fs.existsSync(filename)) {
			console.log("Configuration file '" + filename + "' does not exist!");
			process.exit(1);
		}
		var config = JSON.parse(fs.readFileSync(filename));
		if (!config.rest_api_base_url) {
			console.log("Parameter 'rest_api_base_url' is missing in configuration file!");
			process.exit(1);
		}
		if (!config.websocket_base_url) {
			console.log("Parameter 'websocket_base_url' is missing in configuration file!");
		}
		if (!config.credentials) {
			console.log("Parameter 'credentials' is missing in configuration file!");
		}
		return config;
	}

	if (filename !== undefined) {
		return readConfigFromFile(filename);
	} else {
		console.error("Parameter \"-c,--config\" or environment variable $WB_TESTBED is missing. Exiting.");
		process.exit(1);
	}
}

function filterWiseMLSetupForNodeTypes(nodeTypes, wiseMLNodeArr) {
  var nodeTypesArr = typeof nodeTypes == "string" ? nodeTypes.split(",") : nodeTypesArr;
  return wiseMLNodeArr.filter(function(node) { return nodeTypesArr.indexOf(node.nodeType) > -1 });
};

function filterWiseMLSetupForSensors(sensors, wiseMLNodeArr) {
  var sensorsArr = typeof sensors == "string" ? sensors.split(",") : sensors;
  return wiseMLNodeArr.filter(function(node) {
  	var capNames = node.capability.map(function (cap) { return cap.name; });
  	for (var i=0; i<capNames.length; i++) {
  	  for (var j=0; j< sensorsArr.length; j++) {
  	  	if (capNames[i].indexOf(sensorsArr[j]) > -1) {
  	      return true;
  	  	}
  	  }
  	}
  	return false;
  });
};

function nodeToString(node) {
  return node.id;
};

function nodeToStringDetails(node) {
  var pos = [];
  var caps = [];
  if (node.position) {
    for (var att in node.position) {
      pos.push(att + "=" + node.position[att]);
    }
  }
  if (node.capability) {
  	for (var att in node.capability) {
  	  caps.push(node.capability[att].name.indexOf('urn:wisebed:node:capability:') > - 1 ?
  	  	node.capability[att].name.substring('urn:wisebed:node:capability:'.length) :
  	  	node.capability[att].name
  	  );
  	}
  }
  return node.id + " | " + pos.join(",") + " | " + caps.join(",");
};

var replacements = [];
for (var i = -128; i < 0; i++) {
	replacements[128 + i] = "[0x" + (i & 0xFF).toString(16).toUpperCase() + "]";
}
replacements[128 + 0x00] = "[NUL]";
replacements[128 + 0x01] = "[SOH]";
replacements[128 + 0x02] = "[STX]";
replacements[128 + 0x03] = "[ETX]";
replacements[128 + 0x04] = "[EOT]";
replacements[128 + 0x05] = "[ENQ]";
replacements[128 + 0x06] = "[ACK]";
replacements[128 + 0x07] = "[BEL]";
replacements[128 + 0x08] = "[BS]";
replacements[128 + 0x09] = "[TAB]";
replacements[128 + 0x0a] = "[LF]";
replacements[128 + 0x0b] = "[VT]";
replacements[128 + 0x0c] = "[FF]";
replacements[128 + 0x0d] = "[CR]";
replacements[128 + 0x0e] = "[SO]";
replacements[128 + 0x0f] = "[SI]";
replacements[128 + 0x10] = "[DLE]";
replacements[128 + 0x11] = "[DC1]";
replacements[128 + 0x12] = "[DC2]";
replacements[128 + 0x13] = "[DC3]";
replacements[128 + 0x14] = "[DC4]";
replacements[128 + 0x15] = "[NACK]";
replacements[128 + 0x16] = "[SYN]";
replacements[128 + 0x17] = "[ETB]";
replacements[128 + 0x18] = "[CAN]";
replacements[128 + 0x19] = "[EM]";
replacements[128 + 0x1a] = "[SUB]";
replacements[128 + 0x1b] = "[ESC]";
replacements[128 + 0x1c] = "[FS]";
replacements[128 + 0x1d] = "[GS]";
replacements[128 + 0x1e] = "[RS]";
replacements[128 + 0x1f] = "[US]";
for (var k = 0x20; k < 0x7f; k++) {
	replacements[128 + k] = String.fromCharCode(k);
}
replacements[128 + 0x7f] = "[DEL]";

function replaceNonPrintableAsciiCharacters(text) {
	var result = '';
	for (var i=0; i<text.length; i++) {
		result += replacements[128 + text.charCodeAt(i)];
	}
	return result;
};

function toHexString(text) {
	var result = '';
	var c;
	for (var i=0; i<text.length; i++) {
		c = text.charCodeAt(i).toString(16);
		result += '0x' + (c.length == 1 ? '0' : '') + c + ' ';
	}
	return result;
}

/**
 * Retrieves nodes from testbed self-description and, according to the selection options
 * filters the returned set of nodes. If 'reservationId' is given the node selection is
 * scoped to the set of currently reserved nodes.
 */
function retrieveNodes(options, reservationId, onSuccess, onFailure) {

	var config = readConfigOrExit(options.config || process.env['WB_TESTBED']);
	var testbed = new wisebed.Wisebed(config.rest_api_base_url, config.websocket_base_url);
	
	var onSuccessInternal = function(wiseml) {
		var nodes = wiseml.setup.node;
		if (options.types) {
			nodes = filterWiseMLSetupForNodeTypes(options.types, nodes);
		}
		if (options.sensors) {
			nodes = filterWiseMLSetupForSensors(options.sensors, nodes);
		}
		onSuccess(nodes);
	};

	testbed.getWiseML(reservationId, onSuccessInternal, onFailure, "json");
}

function retrieveNodeUrns(options, reservationId, onSuccess, onFailure) {
	
	if (options.nodes) {
		onSuccess(options.nodes.split(","));
	} else {
		retrieveNodes(options, reservationId, function(nodes) {
			onSuccess(nodes.map(function(node) { return node.id; }));
		}, onFailure);
	}
}

function retrieveTimespan(options) {
  
	var from     = options.from     ? moment(options.from)              : moment();
	var duration = options.duration ? moment.duration(options.duration) : null;
	var until    = options.until    ? moment(options.until)             : null;

	if (until != null && duration != null) {
		console.error('Both parameters \"duration\" and \"until\" given. This is ambiguous. Exiting.');
		process.exit(1);
	} else if (until == null && duration != null) {
		until = moment(from).add(duration);
	} else if (duration == null && until != null) {
		duration = moment.duration(until.diff(from));
	} else {
		console.error('Neither parameter \"duration\" nor \"until\" was given. Cannot determine end of reservation. Exiting.');
		process.exit(2);
	}

	if (from.isAfter(until)) {
		console.error('Interval begins after it ends. Does not make sense. Unless you\'re a time traveller. Exiting.');
		process.exit(3);
	}

	return { from : from, until : until, duration : duration };
}

function executeListNodesCommandInternal(options, reservationId) {

  var onSuccess = function(nodes) {
  	console.log(nodes.map(options.details ? nodeToStringDetails : nodeToString).join("\n"));
  	process.exit(0);
  };

  var onFailure = function(wiseML, textStatus, jqXHR) {
    console.error("Error while fetching nodes from testbed: %s %s", textStatus, jqXHR);
    process.exit(1);
  };

  retrieveNodes(options, reservationId, onSuccess, onFailure);
}

function executeListNodesCommand(options) {
  executeListNodesCommandInternal(options, null);
}

function executeListReservedNodesCommand(options) {
  executeListNodesCommandInternal(options, getAssertReservationId(options));
}

function executeCurrentReservation(options) {

	var config = readConfigOrExit(options.config || process.env['WB_TESTBED']);
	var testbed = new wisebed.Wisebed(config.rest_api_base_url, config.websocket_base_url);

	testbed.reservations.getPersonal(
		moment(),
		null,
		function(reservations) {
			if (reservations.length == 0) {
				console.error('No reservations found. Exiting.');
				process.exit(1);
			} else {
				console.log(reservations[reservations.length-1].reservationId);
			}
		},
		onAjaxFailure,
		config.credentials
	);
}

function executeMakeReservationCommand(options) {
  
  var config = readConfigOrExit(options.config || process.env['WB_TESTBED']);
  var testbed = new wisebed.Wisebed(config.rest_api_base_url, config.websocket_base_url);
  var timespan = retrieveTimespan(options);

  function onSuccess(nodes) {
  	var nodeUrns = nodes.map(function(node) { return node.id; });
  	testbed.reservations.make(
        timespan.from,
        timespan.until,
        nodeUrns,
        options.description ? options.description : null,
        [],
        function(crd) {
          console.log(crd.reservationId);
        },
        function(jqXHR, textStatus, errorThrown) {
        	console.error(jqXHR.responseText);
        	process.exit(jqXHR.status);
        },
        config.credentials
    );
  }

  retrieveNodes(options, null, onSuccess, onAjaxFailure);
}

function executeListReservationsCommand(options) {

  var config = readConfigOrExit(options.config || process.env['WB_TESTBED']);
  var testbed = new wisebed.Wisebed(config.rest_api_base_url, config.websocket_base_url);

  var from = options.from ? moment(options.from) : new Date();
  var to = options.to ? moment(options.to) : null;

  if (options.all) {
    
    function onGetPublicReservationsSuccess(reservations) {
      reservations.forEach(function(reservation) {
        var dateFormat = 'YYYY-MM-DD HH:mm:ss';
        console.log(reservation.from.format(dateFormat) + " - " + reservation.to.format(dateFormat) + " | [" + reservation.nodeUrns.join(",") + "]");
      });
      process.exit(0);
	}

  	testbed.reservations.getPublic(from, to, onGetPublicReservationsSuccess, onAjaxFailure);

  } else {

  	function onGetPersonalReservationsSuccess(reservations) {
  		reservations.forEach(function(reservation) {
  			var dateFormat = 'YYYY-MM-DD HH:mm:ss';
  			console.log(reservation.from.format(dateFormat) + " - " + reservation.to.format(dateFormat) + " | " + reservation.nodeUrns.length + " node(s) | " + reservation.reservationId + " | " + reservation.description);
  		});
  	}

    testbed.reservations.getPersonal(
    		from,
    		to,
    		onGetPersonalReservationsSuccess,
    		onAjaxFailure,
    		config.credentials
    );
  }
}

function executeReset(options) {
	var config = readConfigOrExit(options.config || process.env['WB_TESTBED']);
	var testbed = new wisebed.Wisebed(config.rest_api_base_url, config.websocket_base_url);
	var reservationId = getAssertReservationId(options);
	retrieveNodes(options, reservationId, function(nodes) {
		testbed.experiments.resetNodes(reservationId, nodes.map(function(node) {return node.id;}), function(result) {
		}, onAjaxFailure)
	}, onAjaxFailure);
}

function onAjaxFailure(jqXHR, textStatus, errorThrown) {
	console.error(jqXHR);
	console.error(textStatus);
	console.error(errorThrown);
}

function getReservationId(options) {
	var reservationId = options.reservationId || process.env['WB_RESERVATION'];
	if (reservationId == '') {
		reservationId = undefined;
	}
	return reservationId;
}

function getAssertReservationId(options) {
	var reservationId = getReservationId(options);
	if (!reservationId) {
		console.error('Parameter "-i,--reservationId" or environment variable WB_RESERVATION missing. Exiting.');
		process.exit(1);
	}
	return reservationId;
};

function executeListen(options) {

  var config = readConfigOrExit(options.config || process.env['WB_TESTBED']);
  var testbed = new wisebed.Wisebed(config.rest_api_base_url, config.websocket_base_url);

  if (options.outputsOnly && options.eventsOnly) {
    console.log("Both --outputsOnly and --eventsOnly given. Doesn't make sense. Exiting.");
    process.exit(1);
  }
  
  var events = !options.outputsOnly;
  var outputs = !options.eventsOnly;

  var eventWebSocket;
  var outputsWebSocket;

  if (events) {
    eventWebSocket = new testbed.EventWebSocket(
      function(devicesAttachedEvent) { console.log(devicesAttachedEvent);  },
      function(devicesDetachedEvent) { console.log(devicesDetachedEvent);  },
      function(onOpenEvent)          { /* nothing to do here, is there? */ },
      function(onCloseEvent)         { /* nothing to do here, is there? */ }
    );
  }

  if (outputs) {

    var reservationId = getAssertReservationId(options);

    outputsWebSocket = new testbed.WebSocket(
      reservationId,
      function(message)      {

      	if (message.type == 'reservationEnded') {

          console.error('Reservation ended ' + moment(message.timestamp).fromNow() + '. Exiting.');
          process.exit(0);

        } else if (message.type == 'upstream') {
          /*
          { type: 'upstream',
		  payloadBase64: 'EAJoADB4MzogVWFydEVjaG8gc3RhcnRlZCEQAw==',
		  sourceNodeUrn: 'urn:wisebed:uzl:staging1:0x0003',
		  timestamp: '2013-11-21T16:37:43.470+01:00' }
          */
          var textArr = atob(message.payloadBase64);
          var text    = replaceNonPrintableAsciiCharacters(textArr);
          var hexText = toHexString(textArr);

          if (options.format == 'csv') {
            console.log(message.timestamp + ";" + message.sourceNodeUrn + ";" + text.replaceAll(/;/g, "\\;") + ";" + hexText);
      	  } else {
      	  	console.log(message.timestamp + " | " + message.sourceNodeUrn + " | " + text + " | " + hexText);
      	  }
        }
      },
      function(onOpenEvent)  { /* nothing to do here, is there? */ },
      function(onCloseEvent) { /* nothing to do here, is there? */ }
    );
  }
}

function executeFlash(options) {

	var config        = readConfigOrExit(options.config || process.env['WB_TESTBED']);
	var testbed       = new wisebed.Wisebed(config.rest_api_base_url, config.websocket_base_url);
	var reservationId = getAssertReservationId(options);

	var jsonConfig;

	if (!reservationId) {
		console.error('Parameter "reservationId" missing. Exiting.');
		process.exit(1);
	}

	var createConfig;

	if (options.file) {

		createConfig = function(options, callbackDone, callbackError) {
			jsonConfig = JSON.parse(fs.readFileSync(options.file));
			jsonConfig.configurations.forEach(function(configuration) {
				if (!configuration.image && configuration.imageFile) {
					configuration.image = "data:application/octet-stream;base64," + btoa(fs.readFileSync(configuration.imageFile));
					delete configuration.imageFile;
				}
			});
			callbackDone(jsonConfig);
		};

	} else if (options.image) {

		createConfig = function(options, callbackDone, callbackError) {
			retrieveNodeUrns(options, reservationId, function(nodeUrns) {
				jsonConfig = {
					configurations : [{
						nodeUrns : nodeUrns,
						image    : "data:application/octet-stream;base64," + btoa(fs.readFileSync(options.image))
					}]
				};
				callbackDone(jsonConfig);
			}, callbackError);
		};

	} else {

		console.error("You must provide either \"--image\" or \"--file\". Exiting.");
		process.exit(1);
	}

	createConfig(options, function(jsonConfig) {
		testbed.experiments.flashNodes(
			reservationId,
			jsonConfig,
			function(result)   { console.log(result);   },
			function(progress) { console.log(progress); },
			onAjaxFailure
		);
	}, onAjaxFailure);
}

function executeAreNodesAlive(options) {

	var config        = readConfigOrExit(options.config || process.env['WB_TESTBED']);
	var testbed       = new wisebed.Wisebed(config.rest_api_base_url, config.websocket_base_url);
	var reservationId = getReservationId(options);

	retrieveNodes(options, reservationId, function(nodes) {

		var nodeUrns = nodes.map(function(node) { return node.id; });
		var callbackDone = function(result) { console.log(result); }

		if (reservationId) {
			testbed.experiments.areNodesAlive(reservationId, nodeUrns, callbackDone, onAjaxFailure);
		} else {
			testbed.experiments.areNodesConnected(nodeUrns, callbackDone, onAjaxFailure);
		}

	}, onAjaxFailure);
}

function executeWiseML(options) {

	var config  = readConfigOrExit(options.config || process.env['WB_TESTBED']);
	var testbed = new wisebed.Wisebed(config.rest_api_base_url, config.websocket_base_url);
	var reservationId = getReservationId(options);

	if (options.format && options.format == 'xml') {
		testbed.getWiseMLAsXML(reservationId, function(wiseml) { console.log(wiseml); }, onAjaxFailure);
	} else {
		testbed.getWiseMLAsJSON(reservationId, function(wiseml) { console.log(wiseml); }, onAjaxFailure);
	}
}

function executeGetPipelineHandlers(options) {
	
	var config  = readConfigOrExit(options.config || process.env['WB_TESTBED']);
	var testbed = new wisebed.Wisebed(config.rest_api_base_url, config.websocket_base_url);
	var reservationId = getAssertReservationId(options);

	retrieveNodeUrns(options, reservationId, function(nodeUrns) {
		var callbackDone = function(result) { console.log(result); }
		console.log(testbed);
		testbed.experiments.getChannelPipelines(reservationId, nodeUrns, callbackDone, onAjaxFailure);
	}, onAjaxFailure);
}

function executeSetChannelPipeline(options) {

	var config  = readConfigOrExit(options.config || process.env['WB_TESTBED']);
	var testbed = new wisebed.Wisebed(config.rest_api_base_url, config.websocket_base_url);
	var reservationId = getAssertReservationId(options);

	if (!options.pipeline && !options.clearPipeline) {
		console.error("Missing parameter \"-p, --pipeline <handler_1[,handler_2[,...]]>\". Exiting.");
		process.exit(1);
	}

	var pipeline = options.clearPipeline ? [] : options.pipeline.split(",");
	var handlers = [];

	pipeline.forEach(function(p) {
		handlers.push({
			name : p
		});
	});

	retrieveNodeUrns(options, reservationId, function(nodeUrns) {
		testbed.experiments.setChannelPipelines(
			reservationId,
			nodeUrns,
			handlers,
			function(result) { console.log(result); },
			onAjaxFailure
		);
	}, onAjaxFailure);
}

var $         = require('jquery');
var fs        = require('fs');
var commander = require('commander');
var wisebed   = require('wisebed.js');
var moment    = require('moment');
var atob      = require('atob');
var btoa      = require('btoa');

var config;

var commands = {
	'nodes' : {
		description       : 'list available nodes',
		action            : executeListNodesCommand,
		nodeFilterOptions : true,
		options           : {
			"-d, --details" : "show sensor node details"
		}
	},
	'reserved-nodes' : {
		description       : 'list nodes of current reservation',
		action            : executeListReservedNodesCommand,
		nodeFilterOptions : true,
		idOption          : true
	},
	'current-reservation' : {
		description       : 'prints the ID of the current reservation (the youngest which is either running or starts in the future)',
		action            : executeCurrentReservation
	},
	'make-reservation' : {
		description       : 'makes a reservation and (if successful) prints its ID',
		action            : executeMakeReservationCommand,
		nodeFilterOptions : true,
		options           : {
			"-n, --nodes <nodes>"       : "a list of node URNs to be flashed (only if node filter options are not given)",
			"-f, --from  <from> "       : "date and time of the reservation start (default: now, see moment.js documentation for allowed syntax)",
			"-u, --until <until>"       : "date and time of the reservation end   (see moment.js documentation for allowed syntax)",
			"-d, --duration <duration>" : "duration of the reservation (see moment.js documentation for allowed syntax)",
			"-D, --description <desc>"  : "description of the reservation",
			"-o, --options <options>"   : "options to save as reservation meta data (key/value pairs)"
		}
	},
	'list-reservations' : {
		description       : 'lists existing reservations (default: running and future)',
		action            : executeListReservationsCommand,
		nodeFilterOptions : true,
		idOption          : true,
		options           : {
			"-a, --all"              : "lists all reservations (default: only personal reservations)",
			"-f, --from  <datetime>" : "date and time of the query interval start (see moment.js documentation for allowed syntax)",
			"-u, --until <datetime>" : "date and time of the query interval end   (see moment.js documentation for allowed syntax)"
		}
	},
	'listen' : {
		description       : 'listens to node outputs and testbed events',
		action            : executeListen,
		nodeFilterOptions : true,
		idOption          : true,
		options           : {
			"-f, --format <format>" : "output format (\"\", \"csv\" or \"lines\", default: \"lines\")",
			"-o, --outputsOnly"     : "show sensor node outputs only",
			"-e, --eventsOnly"      : "show testbed events only"
		}
	},
	'flash' : {
		description       : 'flashes nodes',
		action            : executeFlash,
		nodeFilterOptions : true,
		idOption          : true,
		options           : {
			"-i, --image <image>" : "path to image file to be flashed  (if -f/--file is not used)",
			"-f, --file <file>"   : "a flash configuration file"
		}
	},
	'reset' : {
		description       : 'resets nodes',
		action            : executeReset,
		nodeFilterOptions : true,
		idOption          : true,
		options           : {
			"-n, --nodes <nodes>" : "a list of node URNs to be reset (only if \"-t,--types\" / \"-s,--sensors\" is not used"
		}
	},
	'alive' : {
		description       : 'checks if nodes are alive/connected',
		action            : executeAreNodesAlive,
		nodeFilterOptions : true,
		idOption          : true,
		options           : {
			"-n, --nodes <nodes>" : "a list of node URNs to be reset (only if \"-t,--types\" / \"-s,--sensors\" is not used"
		}
	},
	'wiseml' : {
		description       : 'prints the testbeds self-description in WiseML (default format: JSON serialization). if "-i, --id" is given prints only the part relevant to the current reservation.',
		action            : executeWiseML,
		idOption          : true,
		options           : {
			"-f, --format <'json'|'xml'>" : "the format of the WiseML file ('json' (default) or 'xml')"
		}
	},
	/*'get-pipeline-handlers' : {
		description       : 'returns all availabel pipeline handlers and their descriptions',
		action            : executeGetPipelineHandlers,
		idOption          : true
	},*/
	'set-channel-pipeline' : {
		description       : 'prints the testbeds self-description in WiseML (default format: JSON serialization). if "-i, --id" is given prints only the part relevant to the current reservation.',
		action            : executeSetChannelPipeline,
		nodeFilterOptions : true,
		idOption          : true,
		options           : {
			"-p, --pipeline <handler_1[,handler_2[,...]]>" : "comma-separated names of the pipeline handlers",
			"-C, --clearPipeline" : "clears the pipeline of all handlers"
		}
	}
};

commander
	.version('1.0')
	.option('-H, --helpConfig', 'Print out help about the configuration file')

for (var name in commands) {
	
	var cmd = commander.command(name).description(commands[name].description).action(commands[name].action);
	
	cmd.option("-c, --config  <config>", "config file containing testbed configuration");

	if (commands[name].nodeFilterOptions) {
		cmd.option("-n, --nodes   <nodelist>", "comma-separated list of node URNs (not for use in conjunction with --types and --sensors");
		cmd.option("-t, --types   <types>", "comma-separated list of node types to include (not for use in conjuction with --nodes)");
    	cmd.option("-s, --sensors <sensors>", "comma-separated list of sensors to filter for (not for use in conjuction with --nodes)");
	}

	if (commands[name].idOption) {
		cmd.option("-i, --id <id>", "the ID of the reservation");
	}

	for (option in commands[name].options)  {
		cmd.option(option, commands[name].options[option]);
	}
}

var options = commander.parse(process.argv);
if (options.args.length == 0) {
	options.outputHelp();
}
