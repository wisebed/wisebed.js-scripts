#!/usr/bin/env node

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

function toDecString(text) {
	var result = '';
	var c;
	for (var i=0; i<text.length; i++) {
		c = text.charCodeAt(i).toString(10);
		if (c.length == 1) {
		  result += '00' + c + ' ';
		} else if (c.length == 2) {
		  result += '0' + c + ' ';
		} else {
		  result += c + ' ';
		}
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
  	console.log(
			nodes
					.map(options.details ? nodeToStringDetails : nodeToString)
					.join(options.format == 'csv' ? "," : "\n")
		);
  	process.exit(0);
  };

  var onFailure = function(wiseML, textStatus, jqXHR) {
    console.trace("Error while fetching nodes from testbed: %s %s", textStatus, jqXHR);
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
				console.log(reservations);
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

  function onSuccess(nodeUrns) {
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

  retrieveNodeUrns(options, null, onSuccess, onAjaxFailure);
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
		console.error('Reservation Id parameter "-i,--Id" or environment variable WB_RESERVATION missing. Exiting.');
		process.exit(1);
	}
	return reservationId;
};

function executeLog(options) {

  var config = readConfigOrExit(options.config || process.env['WB_TESTBED']);
  var downloadUrl = config.rest_api_base_url + '/events/' + getAssertReservationId(options) + ".json";

  if (options.raw) {

    var downloadUrl = config.rest_api_base_url + '/events/' + getAssertReservationId(options) + ".json";
    http.get(url.parse(downloadUrl), function(res) {
      res.pipe(process.stdout);
    });

  } else {

  	http.get(url.parse(downloadUrl), function(res) {
      res.pipe(JSONStream.parse('*'))
  	    .pipe(es.through(filterStreamMessage(options)))
  	    .pipe(es.mapSync(formatStreamMessage(options)))
  	    .pipe(es.mapSync(function(message) { return message + "\n"; }))
  	    .pipe(process.stdout);
    });
  }
}

function executeListen(options) {

  var config = readConfigOrExit(options.config || process.env['WB_TESTBED']);
  var testbed = new wisebed.Wisebed(config.rest_api_base_url, config.websocket_base_url);

  if (options.outputsOnly && options.eventsOnly) {
    console.log("Both --outputsOnly and --eventsOnly given. Doesn't make sense. Exiting.");
    process.exit(1);
  }

  if (!options.mode) {
    options.mode = 'ascii';
  }
  
  var eventWebSocket;
  var outputsWebSocket;

  if (!options.outputsOnly) {
    eventWebSocket = new testbed.EventWebSocket(
      function(devicesAttachedEvent) { console.log(devicesAttachedEvent);  },
      function(devicesDetachedEvent) { console.log(devicesDetachedEvent);  },
      function(onOpenEvent)          { /* nothing to do here, is there? */ },
      function(onCloseEvent)         { /* nothing to do here, is there? */ }
    );
  }

  var reservationId = getAssertReservationId(options);

  outputsWebSocket = new testbed.WebSocket(
    reservationId,
    onStreamMessage(options),
    function(onOpenEvent)  { /* nothing to do here, is there? */ },
    function(onCloseEvent) { /* nothing to do here, is there? */ }
  );
}

function onStreamMessage(options) {
  return function(message) {
  	var print = message.type != 'keepAlive' && (
  	  (options.eventsOnly && message.type != 'upstream') ||
  	  (options.outputsOnly && message.type == 'upstream') ||
  	  (!options.eventsOnly && !options.outputsOnly)
		);
  	if (print) {
  	  var fn = formatStreamMessage(options);
      console.log(fn(message));
    }
    if (message.type == 'reservationEnded') {
      process.exit(0);
    }
  }
}

function filterStreamMessage(options) {
  return function(message) {
  	var include =
  	  (options.eventsOnly && message.type != 'upstream') ||
  	  (options.outputsOnly && message.type == 'upstream') ||
  	  (!options.eventsOnly && !options.outputsOnly);
  	if (include) {
     this.emit('data', message);
  	}
  }
}

function formatBinaryData(options, payloadBase64) {
  
  if (options.mode == 'hex') {

  	return toHexString(atob(payloadBase64));

  } else if (options.mode == 'dec') {

    return toDecString(atob(payloadBase64));

  } else if (options.mode == 'ascii' || options.mode === undefined) {

  	var text = replaceNonPrintableAsciiCharacters(atob(payloadBase64));

  	if (options.format == 'csv') {
  	  text = text.replace(/;/g, "\\;");
  	}

  	return text;
  }
}

function formatStreamMessage(options) {

  var events = !options.outputsOnly;
  var outputs = !options.eventsOnly;

  return function(message) {
		// TODO support reservationCancelled
  	var parts = [];

  	if (message.type == 'reservationStarted') {

      parts.push('Reservation started ' + moment(message.timestamp).fromNow());

  	} else if (message.type == 'reservationEnded') {

      parts.push('Reservation ended ' + moment(message.timestamp).fromNow());
      
    } else if (message.type == 'upstream') {
      
      parts.push(message.timestamp);
      parts.push(message.sourceNodeUrn);
      parts.push(formatBinaryData(options, message.payloadBase64));

    } else if (message.type == 'devicesAttached') {
      
      parts.push(message.timestamp);
      parts.push(message.type);
      parts.push(message.nodeUrns);

    } else if (message.type == 'devicesDetached') {
      
      parts.push(message.timestamp);
      parts.push(message.type);
      parts.push(message.nodeUrns);

    } else if (message.type == 'areNodesAliveRequest') {

      parts.push(message.timestamp);
      parts.push(message.type);
      parts.push(message.requestId);
      parts.push(message.areNodesAliveRequest.nodeUrns);
      
    } else if (message.type == 'areNodesConnectedRequest') {

      parts.push(message.timestamp);
      parts.push(message.type);
      parts.push(message.requestId);
      parts.push(message.areNodesConnectedRequest.nodeUrns);
      
    } else if (message.type == 'disableNodesRequest') {

      parts.push(message.timestamp);
      parts.push(message.type);
      parts.push(message.requestId);
      parts.push(message.disableNodesRequest.nodeUrns);
      
    } else if (message.type == 'disableVirtualLinksRequest') {

      parts.push(message.timestamp);
      parts.push(message.type);
      parts.push(message.requestId);
      parts.push(JSON.stringify(message.disableVirtualLinksRequest.links));
      
    } else if (message.type == 'disablePhysicalLinksRequest') {

      parts.push(message.timestamp);
      parts.push(message.type);
      parts.push(message.requestId);
      parts.push(JSON.stringify(message.disablePhysicalLinksRequest.links));
      
    } else if (message.type == 'enableNodesRequest') {

      parts.push(message.timestamp);
      parts.push(message.type);
      parts.push(message.requestId);
      parts.push(JSON.stringify(message.enableNodesRequest.links));
      
    } else if (message.type == 'enablePhysicalLinksRequest') {

      parts.push(message.timestamp);
      parts.push(message.type);
      parts.push(message.requestId);
      parts.push(JSON.stringify(message.enablePhysicalLinksRequest.links));
      
    } else if (message.type == 'enableVirtualLinksRequest') {

      parts.push(message.timestamp);
      parts.push(message.type);
      parts.push(message.requestId);
      parts.push(JSON.stringify(message.enableVirtualLinksRequest.links));

    } else if (message.type == 'flashImagesRequest') {

      parts.push(message.timestamp);
      parts.push(message.type);
      parts.push(message.requestId);
      parts.push(message.flashImagesRequest.nodeUrns);
      
    } else if (message.type == 'getChannelPipelinesRequest') {

      parts.push(message.timestamp);
      parts.push(message.type);
      parts.push(message.requestId);
      parts.push(message.getChannelPipelinesRequest.nodeUrns);
      
    } else if (message.type == 'resetNodesRequest') {

      parts.push(message.timestamp);
      parts.push(message.type);
      parts.push(message.requestId);
      parts.push(message.resetNodesRequest.nodeUrns);
      
    } else if (message.type == 'sendDownstreamMessagesRequest') {

      parts.push(message.timestamp);
      parts.push(message.type);
      parts.push(message.requestId);
      parts.push(message.sendDownstreamMessagesRequest.nodeUrns);
      parts.push(formatBinaryData(options, message.sendDownstreamMessagesRequest.messageBytesBase64));
      
    } else if (message.type == 'setChannelPipelinesRequest') {

      parts.push(message.timestamp);
      parts.push(message.type);
      parts.push(message.requestId);
      parts.push(JSON.stringify(message.setChannelPipelinesRequest));
      
    } else if (message.type == 'singleNodeResponse') {

      parts.push(message.timestamp);
      parts.push(message.type);
      parts.push(message.requestId);
      parts.push(message.nodeUrn);
      parts.push(message.statusCode);
      if (message.statusCode >= 0) {
      	parts.push(message.response ? message.response : '');
      } else {
      	parts.push(message.errorMessage);
      }
      
    } else if (events) {

      // unknown message (e.g. for future additions)
      return JSON.stringify(message);
    }

    return parts.join(options.format == 'csv' ? ';' : ' | ');
  }
}

function executeFlash(options) {

	var config        = readConfigOrExit(options.config || process.env['WB_TESTBED']);
	var testbed       = new wisebed.Wisebed(config.rest_api_base_url, config.websocket_base_url);
	var reservationId = getAssertReservationId(options);

	var jsonConfig;
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

var fs         = require('fs');
var commander  = require('commander');
var wisebed    = require('wisebed.js');
var moment     = require('moment');
var atob       = require('atob');
var btoa       = require('btoa');
var http       = require('http');
var url        = require('url');
var JSONStream = require('JSONStream');
var es         = require('event-stream');

var config;

var commands = {
	'nodes' : {
		description       : 'list available nodes',
		action            : executeListNodesCommand,
		nodeFilterOptions : true,
		options           : {
			"-d, --details"         : "show sensor node details",
			"-f, --format <format>" : "'csv' or 'lines' (default: 'lines')"
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
	'log' : {
		description       : 'downloads event and output log (JSON format)',
		action            : executeLog,
		nodeFilterOptions : true,
		idOption          : true,
		options           : {
			"-r, --raw"             : "download \"raw\" json only and print it to stdout (default: false, ignores filter and format options)",
			"-f, --format <format>" : "output format (\"\", \"csv\" or \"lines\", default: \"lines\")",
			"-m, --mode <hex|ascii>": "output mode (hex|ascii), both if ommitted", 
			"-o, --outputsOnly"     : "show sensor node outputs only",
			"-e, --eventsOnly"      : "show testbed events only"
		}
	},
	'listen' : {
		description       : 'listens to node outputs and testbed events',
		action            : executeListen,
		nodeFilterOptions : true,
		idOption          : true,
		options           : {
			"-f, --format <format>" : "output format (\"\", \"csv\" or \"lines\", default: \"lines\")",
			"-m, --mode <hex|ascii>": "output mode (hex|dec|ascii), both if ommitted", 
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
	.version('0.2.4')
	.option('-H, --helpConfig', 'Print out help about the configuration file')
	.on('--help', function(){
		console.log('  See README.md for more usage information!');
		console.log('');
	});

for (var name in commands) {
	
	var cmd = commander.command(name).description(commands[name].description).action(commands[name].action);
	
	cmd.option("-c, --config  <config>", "config file containing testbed configuration");

	if (commands[name].nodeFilterOptions) {
		cmd.option("-n, --nodes   <nodelist>", "comma-separated list of node URNs (not for use in conjunction with --types and --sensors");
		cmd.option("-t, --types   <types>",    "comma-separated list of node types to include (not for use in conjuction with --nodes)");
		cmd.option("-s, --sensors <sensors>",  "comma-separated list of sensors to filter for (not for use in conjuction with --nodes)");
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
